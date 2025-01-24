interface LogSubscribeResponse {
  jsonrpc: string;
  result: number;
  id: number;
}

export interface LogNotification {
  jsonrpc: string;
  method: string;
  params: {
    result: {
      context: {
        slot: number;
      };
      value: {
        signature: string;
        err: object | null;
        logs: [string] | null;
      };
    };
    subscription: number;
  };
}

export type WebSocketMessageData = LogSubscribeResponse | LogNotification;
