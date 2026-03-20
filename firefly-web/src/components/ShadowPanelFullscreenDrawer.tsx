import React from 'react';
import { Drawer } from 'antd';

interface ShadowPanelFullscreenDrawerProps {
  title: React.ReactNode;
  open: boolean;
  onClose: () => void;
  extra?: React.ReactNode;
  children: React.ReactNode;
}

const ShadowPanelFullscreenDrawer: React.FC<ShadowPanelFullscreenDrawerProps> = ({
  title,
  open,
  onClose,
  extra,
  children,
}) => (
  <Drawer
    title={title}
    open={open}
    onClose={onClose}
    extra={extra}
    width="75vw"
    destroyOnHidden
    styles={{
      body: {
        padding: 20,
        paddingTop: 12,
        background: 'linear-gradient(180deg, #f8fbff 0%, #f5f8fc 100%)',
      },
    }}
  >
    {children}
  </Drawer>
);

export default ShadowPanelFullscreenDrawer;
