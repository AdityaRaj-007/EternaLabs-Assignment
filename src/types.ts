export type OrderStatus =
  | "pending"
  | "queued"
  | "routing"
  | "building"
  | "submitted"
  | "confirmed"
  | "failed";

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
  venue?: string;
  price?: number;
  txHash?: string;
}

export interface Quote {
  venue: "Raydium" | "Meteora";
  price: number;
  fee: number;
}
