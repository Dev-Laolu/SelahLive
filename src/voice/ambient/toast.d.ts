export type ToastFn = (message: string, tone?: string) => void;
export function useToast(): ToastFn;
