export interface SignalMessage {
  type: string;
  id?: string;
  to?: string;
  data?: any;
}
