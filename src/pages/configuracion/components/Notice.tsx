export interface NoticeMessage {
  type: 'success' | 'error';
  text: string;
}

export default function Notice({ message }: { message: NoticeMessage | null }) {
  if (!message) return null;
  const isSuccess = message.type === 'success';
  return (
    <div className={`p-4 rounded-lg flex items-center gap-3 ${isSuccess ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-700'}`}>
      <i className={`${isSuccess ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} text-xl`}></i>
      <span className="text-sm font-medium">{message.text}</span>
    </div>
  );
}
