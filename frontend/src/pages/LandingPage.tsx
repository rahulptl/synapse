import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, MessageSquare, Settings, Shield, Zap, Database } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function LandingPage() {
  const { user } = useAuth();

  const features = [
    {
      icon: <Database className="h-8 w-8 text-primary" />,
      title: "Knowledge Base",
      description: "Organize your information in hierarchical folders with intelligent categorization and easy retrieval."
    },
    {
      icon: <MessageSquare className="h-8 w-8 text-primary" />,
      title: "AI Chat Interface",
      description: "Ask questions about your knowledge base using natural language and get contextual answers powered by RAG."
    },
    {
      icon: <Shield className="h-8 w-8 text-primary" />,
      title: "Secure API Access",
      description: "Manage API keys with expiration dates and authentication for your browser extensions and applications."
    },
    {
      icon: <Zap className="h-8 w-8 text-primary" />,
      title: "Quick Capture",
      description: "Send information to Zyph from anywhere with browser extensions and mobile apps (coming soon)."
    },
    {
      icon: <Brain className="h-8 w-8 text-primary" />,
      title: "Smart Organization",
      description: "Automatically categorize and tag your content with AI-powered analysis and suggestions."
    },
    {
      icon: <Settings className="h-8 w-8 text-primary" />,
      title: "Flexible Management",
      description: "Create, delete, and reorganize folders and content with an intuitive interface."
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-primary opacity-20"></div>
        <div className="relative container mx-auto px-4 py-32 text-center">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-6xl md:text-7xl font-bold mb-8 bg-gradient-primary bg-clip-text text-transparent leading-tight">
              Your Second Brain
            </h1>
            <p className="text-xl md:text-2xl text-foreground/80 mb-12 leading-relaxed max-w-3xl mx-auto">
              Zyph is a powerful context manager that helps you organize, store, and retrieve information 
              using AI. Build your personal knowledge base and chat with your data using natural language.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              {user ? (
                <Button asChild size="lg" className="text-lg px-10 py-6 bg-gradient-primary hover:shadow-glow transition-all duration-300">
                  <Link to="/knowledge">Go to Knowledge Base</Link>
                </Button>
              ) : (
                <Button asChild size="lg" className="text-lg px-10 py-6 bg-gradient-primary hover:shadow-glow transition-all duration-300">
                  <Link to="/auth">Get Started</Link>
                </Button>
              )}
              <Button variant="outline" size="lg" className="text-lg px-10 py-6 border-primary/30 hover:bg-primary/10 transition-all duration-300">
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-24">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-accent bg-clip-text text-transparent">Powerful Features</h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Everything you need to build and manage your personal knowledge base with cutting-edge AI technology
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="h-full hover:shadow-elegant hover:shadow-glow transition-all duration-300 border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <div className="mb-6 p-3 bg-gradient-primary/10 rounded-2xl w-fit">{feature.icon}</div>
                <CardTitle className="text-xl font-semibold">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed text-muted-foreground">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-accent/5"></div>
        <div className="relative container mx-auto px-4">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">How It Works</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Simple workflow to capture, organize, and retrieve your information with AI precision
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
            <div className="text-center group">
              <div className="w-20 h-20 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-glow group-hover:scale-110 transition-transform duration-300">
                <span className="text-3xl font-bold text-primary-foreground">1</span>
              </div>
              <h3 className="text-2xl font-semibold mb-6">Capture</h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Right-click and send content from anywhere on the web directly to your Zyph knowledge base
              </p>
            </div>

            <div className="text-center group">
              <div className="w-20 h-20 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-glow group-hover:scale-110 transition-transform duration-300">
                <span className="text-3xl font-bold text-primary-foreground">2</span>
              </div>
              <h3 className="text-2xl font-semibold mb-6">Organize</h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Create hierarchical folders and let AI help categorize your content automatically
              </p>
            </div>

            <div className="text-center group">
              <div className="w-20 h-20 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-glow group-hover:scale-110 transition-transform duration-300">
                <span className="text-3xl font-bold text-primary-foreground">3</span>
              </div>
              <h3 className="text-2xl font-semibold mb-6">Retrieve</h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Ask questions in natural language and get intelligent answers from your knowledge base
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-primary/10"></div>
        <div className="relative container mx-auto px-4 text-center">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold mb-8 bg-gradient-accent bg-clip-text text-transparent">Ready to Build Your Second Brain?</h2>
            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
              Start organizing your knowledge today with Zyph's powerful AI-driven platform and unlock your potential
            </p>
            
            {user ? (
              <Button asChild size="lg" className="text-xl px-12 py-6 bg-gradient-primary hover:shadow-glow transition-all duration-300">
                <Link to="/knowledge">Open Knowledge Base</Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="text-xl px-12 py-6 bg-gradient-primary hover:shadow-glow transition-all duration-300">
                <Link to="/auth">Sign Up Now</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}