import React, { useState } from 'react';
import type { S3Credentials } from './domain/types';
import AuthScreen from './screens/AuthScreen';
import GalleryScreen from './screens/GalleryScreen';

const App: React.FC = () => {
  const [creds, setCreds] = useState<S3Credentials | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  if (!creds || !email) {
    return (
      <AuthScreen
        onLogin={(c, e) => {
          setCreds(c);
          setEmail(e);
        }}
      />
    );
  }

  return (
    <GalleryScreen
      creds={creds}
      email={email}
      onLogout={() => {
        setCreds(null);
        setEmail(null);
      }}
    />
  );
};

export default App;
