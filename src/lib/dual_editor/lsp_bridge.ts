import {
    AbstractMessageReader,
    AbstractMessageWriter,
    type Message,
    type DataCallback,
    type Disposable
} from 'vscode-jsonrpc';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { MonacoLanguageClient } from 'monaco-languageclient';

export class TauriMessageReader extends AbstractMessageReader {
    private unlisten: UnlistenFn | null = null;
    private buffer: string = "";

    public listen(callback: DataCallback): Disposable {
        listen<string>('lsp_server_to_client', (event) => {
            this.buffer += event.payload;
            while (true) {
                const match = this.buffer.match(/Content-Length:\s*(\d+)\r\n\r\n/i);
                if (!match) break;
                
                const contentLength = parseInt(match[1], 10);
                const headerLength = match[0].length;
                
                // Wait until we have the full message body
                const totalLength = headerLength + contentLength;
                
                // To be fully safe with Content-Length (which is in bytes), we should encode to UTF-8.
                const encoder = new TextEncoder();
                const decoder = new TextDecoder();
                const bufferBytes = encoder.encode(this.buffer);
                
                if (bufferBytes.length >= totalLength) {
                    const jsonBytes = bufferBytes.slice(headerLength, totalLength);
                    const jsonStr = decoder.decode(jsonBytes);
                    
                    // Keep the remaining buffer
                    const remainingBytes = bufferBytes.slice(totalLength);
                    this.buffer = decoder.decode(remainingBytes);
                    
                    try {
                        const msg = JSON.parse(jsonStr) as Message;
                        callback(msg);
                    } catch (e) {
                        console.error("Failed to parse LSP message", e, jsonStr);
                    }
                } else {
                    // Not enough bytes yet
                    break;
                }
            }
        }).then(unlistenFn => {
            this.unlisten = unlistenFn;
        });

        return {
            dispose: () => {
                this.dispose();
            }
        };
    }

    public dispose(): void {
        if (this.unlisten) {
            this.unlisten();
            this.unlisten = null;
        }
        super.dispose();
    }
}

export class TauriMessageWriter extends AbstractMessageWriter {
    public async write(msg: Message): Promise<void> {
        const json = JSON.stringify(msg);
        const encoder = new TextEncoder();
        const jsonBytes = encoder.encode(json);
        const payload = `Content-Length: ${jsonBytes.length}\r\n\r\n${json}`;
        
        await invoke('lsp_client_to_server', { payload });
    }

    public end(): void {}
}

export function createTauriLanguageClient(): MonacoLanguageClient {
    const reader = new TauriMessageReader();
    const writer = new TauriMessageWriter();
    
    return new MonacoLanguageClient({
        name: 'Rhai Language Client',
        clientOptions: {
            documentSelector: ['rhai'],
            errorHandler: {
                error: () => ({ action: 1 }), // Continue
                closed: () => ({ action: 1 }) // Do not restart
            }
        },
        messageTransports: { reader, writer }
    });
}
