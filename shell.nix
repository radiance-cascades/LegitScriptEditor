with import <nixpkgs> {};
mkShell {
  name = "LegitScript Editor";
  packages = [
    emscripten
    nodejs
    git
    jq

    (pkgs.vscode-with-extensions.override {
      vscode = pkgs.vscodium;
      vscodeExtensions = with pkgs.vscode-extensions; [
        esbenp.prettier-vscode
        jnoortheen.nix-ide
      ];
    })
  ];
  buildInputs = with pkgs; [
  ];
}