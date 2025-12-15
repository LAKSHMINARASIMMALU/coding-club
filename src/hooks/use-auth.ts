"use client";

import { useContext } from 'react';
import { AuthContext } from '@/components/providers';
import type { AuthContextType } from '@/lib/types';

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
