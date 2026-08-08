import React from 'react';

interface SectionCardProps {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}

const SectionCard: React.FC<SectionCardProps> = ({ title, icon, action, children, className = "", id }) => {
  return (
    <div id={id} className={`rounded-3xl border border-slate-200 bg-white shadow-sm relative ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <p className="font-black text-slate-900 break-all leading-tight">{title}</p>
        </div>
        {action}
      </div>
      <div className="p-5 relative">{children}</div>
    </div>
  );
};

export default SectionCard;
