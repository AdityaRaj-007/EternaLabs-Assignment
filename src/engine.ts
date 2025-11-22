import { OrderRequest, OrderState, OrderStatus } from "./types";
import WebSocket from "ws";

class OrderExecutionEngine {
  private orders = new Map<string, OrderState>();

  createOrder(id: string, requestBody: OrderRequest) {
    this.orders.set(id, {
      id,
      orderDetails: requestBody,
      status: "pending",
    });
  }

  getOrderDetails(id: string) {
    return this.orders.get(id);
  }

  attachSocketToOrder(id: string, ws: WebSocket) {
    const order = this.orders.get(id);

    if (!order) {
      return;
    }

    order.socket = ws;
  }

  processOrder = (orderId: string) => {
    this.processStep(orderId);
  };

  private processStep = async (orderId: string) => {
    const order = this.orders.get(orderId);

    if (!order) return;

    try {
      // 1. Sending Pending state update
      await new Promise((resolve) => setTimeout(resolve, 1500));
      this.updateStatus(orderId, "pending");

      // 2. Sending Submitted state update
      await new Promise((resolve) => setTimeout(resolve, 1500));
      this.updateStatus(orderId, "submitted");

      // 3. Sending Confirmed status update
      await new Promise((resolve) => setTimeout(resolve, 3000));
      this.updateStatus(orderId, "confirmed");
    } catch (err) {
      console.error("Error occured while updating the status!");
    }
  };

  private updateStatus(id: string, status: OrderStatus) {
    const order = this.orders.get(id);

    if (!order) return;

    order.status = status;
    this.broadcastStatus(order);
  }

  private broadcastStatus(order: OrderState) {
    if (order.socket && order.socket.readyState === WebSocket.OPEN) {
      try {
        order.socket.send(
          JSON.stringify({
            orderId: order.id,
            status: order.status,
            timestamp: new Date().toISOString(),
          })
        );
      } catch (err) {
        console.error("Failed to send status update!", {
          err,
          orderId: order.id,
        });
      }
    }
  }
}

export const orderEngine = new OrderExecutionEngine();
