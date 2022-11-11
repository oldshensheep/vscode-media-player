import * as vscode from "vscode";
import { MediaPlayerProvider } from "./mediaPlayer";
import { AudioPlayerProvider } from "./audioPlayer";

export function activate(context: vscode.ExtensionContext) {

  context.subscriptions.push(MediaPlayerProvider.register(context));
  context.subscriptions.push(AudioPlayerProvider.register(context));
}

export function deactivate() {}
