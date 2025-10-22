import { StatusTile, StatusType } from './StatusTile';

interface StatusTilesContainerProps {
  status: {
    type: StatusType;
    message?: string;
    details?: string;
  } | null;
  className?: string;
}

export function StatusTilesContainer({ status, className = '' }: StatusTilesContainerProps) {
  if (!status) return null;

  return (
    <div className={`flex justify-center my-4 ${className}`}>
      <StatusTile
        status={status.type}
        message={status.message}
        details={status.details}
      />
    </div>
  );
}