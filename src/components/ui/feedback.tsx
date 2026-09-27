export function ErrorBanner({ message }: { message: string }) {
  return <p className="error-banner" role="alert">{message}</p>;
}

export function SuccessBanner({ message }: { message: string }) {
  return <p className="success-banner" role="status">{message}</p>;
}
