import React, { useState } from 'react';
import { LazyBoundary } from './LazyBoundary';

// 開かれるまで、中身の部品を読み込まない(開いたあとは、そのまま置いておく)
export const LazyOnOpen: React.FC<{ open: boolean; children: React.ReactNode }> = ({ open, children }) => {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened ? <LazyBoundary overlay>{children}</LazyBoundary> : null;
};
