import React from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title = "Are you sure?",
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black opacity-50" onClick={onCancel} />

      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description && (
          <div className="mt-2 text-sm text-slate-600">{description}</div>
        )}
        <div className="mt-6 flex justify-end space-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// simple, reusable confirmation hook
export type ConfirmOptions = {
  title?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
};

export const useConfirm = () => {
  const [options, setOptions] = React.useState<
    ConfirmOptions & { resolve: (confirmed: boolean) => void }
  >();

  const confirm = (opts: ConfirmOptions = {}): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions({ ...opts, resolve });
    });
  };

  const handleClose = (result: boolean) => {
    options?.resolve(result);
    setOptions(undefined);
  };

  const dialog = (
    <ConfirmDialog
      open={!!options}
      title={options?.title}
      description={options?.description}
      confirmText={options?.confirmText}
      cancelText={options?.cancelText}
      onConfirm={() => handleClose(true)}
      onCancel={() => handleClose(false)}
    />
  );

  return { confirm, dialog };
};

export default ConfirmDialog;
