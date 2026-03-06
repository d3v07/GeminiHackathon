import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)',
        }}>
            <SignUp
                appearance={{
                    elements: {
                        rootBox: { width: '100%', maxWidth: '420px' },
                        card: {
                            backgroundColor: 'rgba(15, 15, 30, 0.95)',
                            borderRadius: '16px',
                            border: '1px solid rgba(100, 255, 218, 0.15)',
                            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                        },
                        headerTitle: { color: '#e0e0e0' },
                        headerSubtitle: { color: '#888' },
                        formButtonPrimary: {
                            backgroundColor: '#10b981',
                            '&:hover': { backgroundColor: '#059669' },
                        },
                    },
                }}
            />
        </div>
    );
}
