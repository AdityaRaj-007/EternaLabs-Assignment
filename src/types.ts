import WebSocket from "ws";

export type OrderStatus = "pending" | "submitted" | "confirmed";

export interface OrderRequest {
  inputToken: string;
  outputToken: string;
  amount: number;
}

export interface QueueJobData {
  orderId: string;
  orderDetails: OrderRequest;
}

export interface OrderState {
  id: string;
  orderDetails: OrderRequest;
  status: OrderStatus;
  socket?: WebSocket;
}
