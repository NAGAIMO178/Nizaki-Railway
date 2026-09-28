import React from 'react';

interface PhoneContainerProps {
  children: React.ReactNode;
}

export const PhoneContainer: React.FC<PhoneContainerProps> = ({ children }) => {
  return (
    <div className="min-h-screen w-full bg-[#F4F3F8] text-[#221C35] font-sans antialiased flex flex-col selection:bg-[#5B21B6] selection:text-white">
      {children}
    </div>
  );
};

