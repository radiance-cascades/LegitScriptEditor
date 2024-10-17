# For testing purposes, to preview build as on a 'production' server

from flask import Flask, send_from_directory, redirect
import argparse
import os
import logging

parser = argparse.ArgumentParser(description='Serve files from a custom directory and redirect all requests to URL_NAME')
parser.add_argument('--host', type=str, default='0.0.0.0', help='Host to listen on (default: 0.0.0.0)')
parser.add_argument('--port', type=int, default=8000, help='Port to listen on (default: 8000)')
parser.add_argument('--sdir', choices=['prod', 'dev'], default='prod')
args = parser.parse_args()

URL_NAME = 'LegitScriptEditor'
SUBDIR = '../dist/' + args.sdir

app = Flask(__name__)
logging.basicConfig(level=logging.DEBUG)
logging.warning(f'Serving "{SUBDIR}" on http://{args.host}:{args.port}')

@app.route('/<path:subpath>', methods=['GET', 'POST'])
def redirect_to_project(subpath):
    if subpath.startswith(URL_NAME):
        return serve_project_files(subpath)
    return redirect(f'/{URL_NAME}/index.html', code=302)

@app.route('/', methods=['GET', 'POST'])
def redirect_to_project_root():
    return redirect(f'/{URL_NAME}/index.html', code=302)

@app.route(f'/{URL_NAME}/<path:filename>', methods=['GET'])
def serve_project_files(filename):
    project_dir = SUBDIR 

    file_path = os.path.join(project_dir, filename)
    index_path = os.path.join(project_dir, filename, 'index.html')

    if os.path.exists(index_path):
        return send_from_directory(project_dir, 'index.html')
    elif os.path.exists(file_path):
        return send_from_directory(project_dir, filename)
    else:
        logging.error(f"File not found at: {file_path}")
        return "File not found", 404

if __name__ == '__main__':
    app.run(host=args.host, port=args.port)
