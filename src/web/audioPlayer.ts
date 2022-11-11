import * as vscode from "vscode";
import { Disposable, disposeAll } from "./dispose";
import { getNonce } from "./util";

/**
 * Define the document (the data model) used for paw draw files.
 */
class AudioPlayerDocument extends Disposable implements vscode.CustomDocument {
  static async create(
    uri: vscode.Uri
  ): Promise<AudioPlayerDocument | PromiseLike<AudioPlayerDocument>> {
    return new AudioPlayerDocument(uri);
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

export class AudioPlayerProvider
  implements vscode.CustomReadonlyEditorProvider<AudioPlayerDocument>
{
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      AudioPlayerProvider.viewType,
      new AudioPlayerProvider(context),
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

  private static readonly viewType = "player.audioPlayer";

  /**
   * Tracks all known webviews
   */
  private readonly webviews = new WebviewCollection();

  constructor(private readonly _context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: { backupId?: string },
    _token: vscode.CancellationToken
  ): Promise<AudioPlayerDocument> {
    // vscode.window.showInformationMessage(uri.fsPath);
    const document: AudioPlayerDocument = await AudioPlayerDocument.create(uri);

    const listeners: vscode.Disposable[] = [];

    document.onDidDispose(() => disposeAll(listeners));

    return document;
  }

  async resolveCustomEditor(
    document: AudioPlayerDocument,
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
    vscode.CustomDocumentEditEvent<AudioPlayerDocument>
  >();
  public readonly onDidChangeCustomDocument =
    this._onDidChangeCustomDocument.event;

  private getHtmlForWebview(
    webview: vscode.Webview,
    videoUrI: vscode.Uri
  ): string {
    const audioWebUrI = webview.asWebviewUri(videoUrI);

    return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=5.0" />
        <title>Document</title>
    
        <style>
          * {
            padding: 0;
            margin: 0;
          }
          .container {
            display: flex;
          }
          .toggle {
            flex: 1 1 0;
            height: 50px;
          }
          .progress {
            width: 60%;
            height: 6px;
            background-color: #007acc;
          }
          .slider-container {
            display: flex;
            justify-content: center;
            align-items: baseline;
          }
          .original-data-container {
            display: flex;
            align-items: center;
            flex: 1 1 0;
          }
        </style>
      </head>
      <body>
        <!-- ${audioWebUrI} -->
        <!-- <button onclick="location.reload()">reload</button> -->
    
        <div class="container">
          <button class="toggle" id="toggle">Play</button>
          <div class="original-data-container">
            <div id="originalCurrentTime">00:00</div>
            /
            <div id="originalDuration">00:00</div>
          </div>
        </div>
    
        <div class="slider-container">
          <input
            id="progress"
            class="progress"
            type="range"
            value="0"
            step="0.1"
            min="0"
            max="100"
          />
          <div id="formattedCurrentTime">00:00</div>
          /
          <div id="formattedDuration">00:00</div>
        </div>
    
        <div></div>
        <audio
          loop
          preload="auto"
          id="player"
          class="player"
          src="${audioWebUrI} "
        ></audio>
        <script>
          "use strict";
    
          const player = document.querySelector("#player");
          const progress = document.querySelector("#progress");
          const originalCurrentTime = document.querySelector(
            "#originalCurrentTime"
          );
          const originalDuration = document.querySelector("#originalDuration");
          const formattedCurrentTime = document.querySelector(
            "#formattedCurrentTime"
          );
          const formattedDuration = document.querySelector("#formattedDuration");
          const toggle = document.querySelector("#toggle");
    
          /*
           * if we touching the progress then stop update the progress.value from the player
           * and update the currentTime with the progress.value
           */
          let isTouchingProgress = false;
    
          // formatTime 66.23 to  01:06
          function formatTime(currentTime) {
            let m = Math.floor(currentTime / 60);
            let s = Math.round(currentTime % 60);
            return \`\${m < 10 ? "0" : ""}\${m}:\${s < 10 ? "0" : ""}\${s}\`;
          }
    
          function updateDuration(duration) {
            originalDuration.innerHTML = duration;
            formattedDuration.innerHTML = formatTime(duration);
            progress.max = Math.round(duration);
          }
    
          function updateCurrentTime(currentTime) {
            originalCurrentTime.innerHTML = currentTime;
            formattedCurrentTime.innerHTML = formatTime(currentTime);
            if (!isTouchingProgress) {
              progress.value = Math.round(currentTime);
            }
          }
    
          let updateCurrentTimeWithProgress = function (event) {
            console.log(progress.value);
            player.currentTime = progress.value;
            console.log(player.currentTime);
            updateCurrentTime(progress.value);
          };
          // stepup progress bar
          progress.addEventListener("pointerdown", function (event) {
            isTouchingProgress = true;
            updateCurrentTimeWithProgress();
            progress.addEventListener("pointermove", updateCurrentTimeWithProgress);
          });
          progress.addEventListener("pointerup", function (event) {
            isTouchingProgress = false;
            updateCurrentTimeWithProgress();
            progress.removeEventListener(
              "pointermove",
              updateCurrentTimeWithProgress
            );
          });
    
          toggle.addEventListener("click", () => {
            if (player.paused) {
              player.play();
            } else {
              player.pause();
            }
          });
    
          player.addEventListener("loadeddata", function (e) {
            const duration = player.duration;
            console.log(duration);
            updateDuration(duration);
            player.play();
          });
    
          player.addEventListener("timeupdate", function (e) {
            if (isTouchingProgress) {
              return;
            }
            const currentTime = player.currentTime;
            console.log(currentTime);
            updateCurrentTime(currentTime);
          });
          player.addEventListener("play", function (e) {
            toggle.innerHTML = "Pause";
          });
          player.addEventListener("pause", function (e) {
            toggle.innerHTML = "Play";
          });
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
