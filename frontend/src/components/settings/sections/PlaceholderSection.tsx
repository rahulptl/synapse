import { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PlaceholderSectionProps {
  title: string;
  description: string;
  icon: LucideIcon;
  message?: string;
}

export function PlaceholderSection({
  title,
  description,
  icon: Icon,
  message = "This section is coming soon. Stay tuned for updates!"
}: PlaceholderSectionProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Icon className="h-5 w-5 mr-2" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <Icon className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg">{message}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
