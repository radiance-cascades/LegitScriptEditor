import { LegitScriptCachedImageRequest, RaisesErrorFN } from "./types"

export type ImageCacheAllocatedImage = {
  id: number
  requestId: number
  size : {x: number, y: number}
  handle: WebGLTexture
  framesSinceLastUse: number
}

export type ImageCache = {
  id: number
  allocatedImages: Map<string, ImageCacheAllocatedImage>
  requestIdToAllocatedImage: Map<number, ImageCacheAllocatedImage>
}

const ImageStaleAfterFrames = 2

type ImageFormat = {
  internalFormat: number
  format: number
  type: number
}

type AllowedTextureFormats = "rgba8" | "rgba16f" | "rgba32f"

function ImageFormatToGL(
  gl: WebGL2RenderingContext,
  format: AllowedTextureFormats,
  raiseError: RaisesErrorFN
): ImageFormat | false {
  // see: https://registry.khronos.org/webgl/specs/latest/2.0/#TEXTURE_TYPES_FORMATS_FROM_DOM_ELEMENTS_TABLE
  // internalFormat/format/type compatibility
  switch (format) {
    case "rgba8": {
      return {
        internalFormat: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        format: gl.RGBA,
      }
    }

    case "rgba16f": {
      return {
        internalFormat: gl.RGBA16F,
        type: gl.HALF_FLOAT,
        format: gl.RGBA,
      }
    }

    case "rgba32f": {
      return { internalFormat: gl.RGBA32F, type: gl.FLOAT, format: gl.RGBA }
    }

    default: {
      raiseError(`invalid ImageFormat`)
      return false
    }
  }
}

export function ImageCacheStartFrame(
  gl: WebGL2RenderingContext,
  cache: ImageCache
) {
  const pendingDeletion = new Set<string>()
  for (const [cacheKey, img] of cache.allocatedImages.entries()) {
    img.framesSinceLastUse++
    if (img.framesSinceLastUse >= ImageStaleAfterFrames) {
      pendingDeletion.add(cacheKey)
    }
  }
  for (const cacheKey of Array.from(pendingDeletion)) {
    const entry = cache.allocatedImages.get(cacheKey)
    if (entry) {
      gl.deleteTexture(entry.handle)
      cache.allocatedImages.delete(cacheKey)
    }
  }

  // this should only contain images requested on this frame
  cache.requestIdToAllocatedImage.clear()
}

export function ImageCacheProcessRequest(
  gl: WebGL2RenderingContext,
  cache: ImageCache,
  request: LegitScriptCachedImageRequest,
  raiseError: RaisesErrorFN
) {
  const cacheKey = JSON.stringify(request)

  let cachedImg = cache.allocatedImages.get(cacheKey)
  if (!cachedImg) {
    const texture = gl.createTexture()
    if (!texture) {
      raiseError(`failed to create texture for ${cacheKey}`)
      return
    }

    let imageFormat = ImageFormatToGL(
      gl,
      request.pixel_format as AllowedTextureFormats,
      raiseError
    )
    if (!imageFormat) {
      return
    }

    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      imageFormat.internalFormat,
      request.size.x,
      request.size.y,
      0,
      imageFormat.format,
      imageFormat.type,
      null
    )

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)

    const id = cache.id++

    const cachedImg = {
      id,
      size : {x: request.size.x, y: request.size.y},
      requestId: request.id,
      handle: texture,
      framesSinceLastUse: 0,
    }

    cache.allocatedImages.set(cacheKey, cachedImg)
    cache.requestIdToAllocatedImage.set(request.id, cachedImg)
  } else {
    cachedImg.framesSinceLastUse = 0
    cache.requestIdToAllocatedImage.set(request.id, cachedImg)
  }
}

export function ImageCacheGetImage(
  cache: ImageCache,
  requestId: number
): WebGLTexture | false {
  const img = cache.requestIdToAllocatedImage.get(requestId)
  return img?.handle ?? false
}


export function ImageCacheGetSize(
  cache: ImageCache,
  requestId: number
): {x: number, y: number} {
  const img = cache.requestIdToAllocatedImage.get(requestId)
  return img?.size ? img.size : {x: 1, y: 1}
}