export function ErrorBanner({ message }: { message: string }) {
  return <p className="error-banner">{message}</p>;
}

export function SuccessBanner({ message }: { message: string }) {
  return <p className="success-banner">{message}</p>;
}
