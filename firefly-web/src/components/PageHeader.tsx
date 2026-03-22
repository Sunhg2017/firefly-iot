import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  extra?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, description, extra }) => (
  <div className="page-header-shell">
    <div className="page-header-copy">
      <div className="page-header-title-row">
        <span className="page-header-title-marker" />
        <h2 className="page-header-title">{title}</h2>
      </div>
      {description && (
        <p className="page-header-description">
          {description}
        </p>
      )}
    </div>
    {extra && <div className="page-header-extra">{extra}</div>}
  </div>
);

export default PageHeader;
