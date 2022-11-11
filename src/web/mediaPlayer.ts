import * as vscode from "vscode";
import { Disposable, disposeAll } from "./dispose";
import { getNonce } from "./util";

/**
 * Define the document (the data model) used for paw draw files.
 */
class MediaPlayerDocument extends Disposable implements vscode.CustomDocument {
  static async create(
    uri: vscode.Uri
  ): Promise<MediaPlayerDocument | PromiseLike<MediaPlayerDocument>> {
    return new MediaPlayerDocument(uri);
  }

  private readonly _uri: vscode.Uri;

  private constructor(uri: vscode.Uri) {
    super();
    this._uri = uri;
  }

  public get uri() {
    return this._uri;
  }

  private readonly _onDidDispose = this._register(
    new vscode.EventEmitter<void>()
  );
  /**
   * Fired when the document is disposed of.
   */
  public readonly onDidDispose = this._onDidDispose.event;

  /**
   * Called by VS Code when there are no more references to the document.
   *
   * This happens when all editors for it have been closed.
   */
  dispose(): void {
    this._onDidDispose.fire();
    super.dispose();
  }
}

export class MediaPlayerProvider
  implements vscode.CustomReadonlyEditorProvider<MediaPlayerDocument>
{
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      MediaPlayerProvider.viewType,
      new MediaPlayerProvider(context),
      {
        // For this demo extension, we enable `retainContextWhenHidden` which keeps the
        // webview alive even when it is not visible. You should avoid using this setting
        // unless is absolutely required as it does have memory overhead.
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  private static readonly viewType = "player.mediaPlayer";

  /**
   * Tracks all known webviews
   */
  private readonly webviews = new WebviewCollection();

  constructor(private readonly _context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: { backupId?: string },
    _token: vscode.CancellationToken
  ): Promise<MediaPlayerDocument> {
    // vscode.window.showInformationMessage(uri.fsPath);
    const document: MediaPlayerDocument = await MediaPlayerDocument.create(uri);

    const listeners: vscode.Disposable[] = [];

    document.onDidDispose(() => disposeAll(listeners));

    return document;
  }

  async resolveCustomEditor(
    document: MediaPlayerDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Add the webview to our internal set of active webviews
    this.webviews.add(document.uri, webviewPanel);

    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(
      webviewPanel.webview,
      document.uri
    );
  }

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<MediaPlayerDocument>
  >();
  public readonly onDidChangeCustomDocument =
    this._onDidChangeCustomDocument.event;

  private getHtmlForWebview(
    webview: vscode.Webview,
    videoUrI: vscode.Uri
  ): string {
    const videoWebUrI = webview.asWebviewUri(videoUrI);

    return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Document</title>
    
        <style>
          * {
            padding: 0;
            margin: 0;
          }
          .wrapper {
            overflow: hidden;
            display: flex;
            height: 100vh;
            justify-content: center;
            flex-direction: column;
          }
          .wrapper > video {
            width: 100%;
            height: 100%;
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <video id="player" class="player" src="${videoWebUrI}">
            Video not supported
          </video>
        </div>
        <script>
          const video = document.getElementById("player");
    
          video.play();
    
          video.addEventListener("pointermove", function (e) {
            video.controls = true;
            hideControls();
          });
          video.addEventListener("click", function (e) {
            video.controls = true;
            if (video.paused) {
              video.play();
            } else {
              video.pause();
            }
            hideControls();
          });
    
          const hideControls = debounce(() => {
            video.controls = false;
          }, 1000);
    
          function debounce(func, delay) {
            let timeout;
    
            return function () {
              let context = this;
              let args = arguments;
    
              clearTimeout(timeout);
              timeout = setTimeout(function () {
                func.apply(context, args);
              }, delay);
            };
          }
        </script>
      </body>
    </html>
      `;
  }
}

/**
 * Tracks all webviews.
 */
class WebviewCollection {
  private readonly _webviews = new Set<{
    readonly resource: string;
    readonly webviewPanel: vscode.WebviewPanel;
  }>();

  /**
   * Get all known webviews for a given uri.
   */
  public *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
    const key = uri.toString();
    for (const entry of this._webviews) {
      if (entry.resource === key) {
        yield entry.webviewPanel;
      }
    }
  }

  /**
   * Add a new webview to the collection.
   */
  public add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
    const entry = { resource: uri.toString(), webviewPanel };
    this._webviews.add(entry);

    webviewPanel.onDidDispose(() => {
      this._webviews.delete(entry);
    });
  }
}
