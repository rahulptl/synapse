import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ProfileImageUpload } from '@/components/profile/ProfileImageUpload';
import { VaultLoginAnimation } from './VaultLoginAnimation';
import { VaultCreationAnimation } from './VaultCreationAnimation';

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [showVaultAnimation, setShowVaultAnimation] = useState(false);
  const [showVaultCreationAnimation, setShowVaultCreationAnimation] = useState(false);
  const [showAvatarUpload, setShowAvatarUpload] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const { user, signIn, signUp, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Handle redirect after user is set
  useEffect(() => {
    if (user && redirecting) {
      if (isLogin) {
        // Show vault animation for login
        setShowVaultAnimation(true);
      } else {
        // Show vault creation animation for signup
        setShowVaultCreationAnimation(true);
      }
    }
  }, [user, redirecting, navigate, isLogin]);

  // Handle vault animation completion
  const handleVaultAnimationComplete = () => {
    console.log('[AUTH_PAGE] Vault animation completed, navigating to knowledge');
    setShowVaultAnimation(false);
    setTimeout(() => {
      navigate('/knowledge', { replace: true });
    }, 100);
  };

  // Handle vault creation animation completion
  const handleVaultCreationAnimationComplete = () => {
    console.log('[AUTH_PAGE] Vault creation animation completed, navigating to memory page');
    setShowVaultCreationAnimation(false);
    setTimeout(() => {
      navigate('/knowledge', { replace: true });
    }, 100);
  };

  useEffect(() => {
    if (isLogin) {
      setPasswordError(null);
    }
  }, [isLogin]);

  // Show vault creation animation for successful signup
  if (showVaultCreationAnimation) {
    return (
      <VaultCreationAnimation
        isVisible={showVaultCreationAnimation}
        onComplete={handleVaultCreationAnimationComplete}
      />
    );
  }

  // Show vault animation for successful login
  if (showVaultAnimation) {
    return (
      <VaultLoginAnimation
        isVisible={showVaultAnimation}
        onComplete={handleVaultAnimationComplete}
      />
    );
  }

  // Show loading state while auth is processing
  if (authLoading && redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Setting up your account...</p>
        </div>
      </div>
    );
  }

  // Redirect if already logged in (not during signup flow)
  if (user && !redirecting) {
    return <Navigate to="/knowledge" replace />;
  }

  const validatePassword = (value: string) => {
    if (value.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(value)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(value)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(value)) {
      return 'Password must contain at least one digit';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!isLogin) {
        const validationMessage = validatePassword(password);
        if (validationMessage) {
          setPasswordError(validationMessage);
          toast({
            title: "Error",
            description: validationMessage,
            variant: "destructive",
          });
          setRedirecting(false);
          return;
        }
      }

      const { error } = isLogin
        ? await signIn(email, password)
        : await signUp(email, password, fullName);

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
        setRedirecting(false);
        const errorMessage = error.message || '';
        if (!isLogin && errorMessage.toLowerCase().includes('password')) {
          setPasswordError(errorMessage);
        }
      } else {
        // Success!
        if (!isLogin) {
          setPasswordError(null);
          // Signup successful
          console.log('[AUTH_PAGE] Signup successful, preparing vault creation animation');
          toast({
            title: "Account Created!",
            description: "Creating your secure vault...",
            duration: 5000,
          });

          // Start vault creation animation
          setRedirecting(true);
        } else {
          // Login successful
          console.log('[AUTH_PAGE] Login successful, preparing vault animation');
          toast({
            title: "Authentication Successful!",
            description: "Opening your secure vault...",
            duration: 3000,
          });

          setRedirecting(true);
        }
      }
    } catch (error) {
      console.error('Auth error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      setRedirecting(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="text-3xl font-bold text-primary mb-2">Memory Bay</div>
          <CardTitle>{isLogin ? 'Sign In' : 'Create Account'}</CardTitle>
          <CardDescription>
            {isLogin
              ? 'Enter your credentials to access your knowledge base'
              : 'Create an account to start organizing your knowledge'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (!isLogin && passwordError) {
                    setPasswordError(null);
                  }
                }}
                required
                minLength={8}
                maxLength={100}
                title="Password must be at least 8 characters and include uppercase, lowercase, and numeric characters"
              />
              {!isLogin && (
                <p className={`text-xs ${passwordError ? 'text-destructive' : 'text-muted-foreground'}`}>
                  Password must be at least 8 characters and include uppercase, lowercase, and numeric characters.
                </p>
              )}
              {passwordError && (
                <p className="text-xs text-destructive">{passwordError}</p>
              )}
            </div>
            
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
            </Button>
          </form>

          {/* Avatar Upload Step - Show after successful signup */}
          {showAvatarUpload && user && (
            <div className="mt-6 p-4 border border-border rounded-lg bg-accent/50">
              <div className="text-center space-y-4">
                <h3 className="font-semibold text-lg">Add Profile Picture</h3>
                <p className="text-sm text-muted-foreground">
                  Make your profile stand out (you can skip this step)
                </p>

                <div className="flex justify-center">
                  <ProfileImageUpload
                    avatarUrl={user.avatar_url}
                    userName={user.full_name || user.email}
                    size="lg"
                    editable={true}
                    onUploadComplete={() => {
                      toast({
                        title: "Perfect!",
                        description: "Redirecting to your knowledge base...",
                      });
                      setTimeout(() => {
                        setRedirecting(true);
                        navigate('/knowledge', { replace: true });
                      }, 1000);
                    }}
                  />
                </div>

                <Button
                  variant="ghost"
                  onClick={() => {
                    setRedirecting(true);
                    navigate('/knowledge', { replace: true });
                  }}
                  className="w-full"
                >
                  Skip for now
                </Button>
              </div>
            </div>
          )}

          <div className="mt-4 text-center">
            <Button
              variant="link"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm"
            >
              {isLogin 
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"
              }
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
