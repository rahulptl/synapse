import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ChevronRight, ChevronLeft, Sparkles, Briefcase, Heart, Target, MessageSquare, Check } from 'lucide-react';
import type { ProfileUpdateData } from '@/types/profile';

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  job_title: z.string().optional(),
  company: z.string().optional(),
  industry: z.string().optional(),
  interests: z.array(z.string()).optional(),
  communication_style: z.enum(['formal', 'casual', 'technical']).optional(),
  primary_goals: z.array(z.string()).optional(),
  preferred_response_length: z.enum(['brief', 'medium', 'detailed']).optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface ProfileWizardProps {
  initialData?: Partial<ProfileFormData>;
  onComplete: (data: ProfileUpdateData) => Promise<void>;
  onSkip?: () => void;
}

export function ProfileWizard({ initialData, onComplete, onSkip }: ProfileWizardProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid, isDirty, touchedFields },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      ...initialData,
      job_title: initialData?.job_title || '',
      company: initialData?.company || '',
      industry: initialData?.industry || '',
      interests: initialData?.interests || [],
      communication_style: initialData?.communication_style || undefined,
      primary_goals: initialData?.primary_goals || [],
      preferred_response_length: initialData?.preferred_response_length || undefined,
    },
  });

  const totalSteps = 5;
  const progress = (step / totalSteps) * 100;

  const interests = watch('interests') || [];
  const goals = watch('primary_goals') || [];

  const suggestedInterests = [
    'Technology', 'Science', 'Business', 'Arts', 'Music',
    'Sports', 'Travel', 'Reading', 'Gaming', 'Cooking',
    'Photography', 'Writing', 'Fitness', 'Movies', 'Learning'
  ];

  const suggestedGoals = [
    'Learn new skills', 'Organize knowledge', 'Research topics',
    'Write content', 'Manage projects', 'Study for exams',
    'Track ideas', 'Build second brain', 'Professional development'
  ];

  const toggleArrayItem = (array: string[], item: string, setter: (value: string[]) => void) => {
    if (array.includes(item)) {
      setter(array.filter(i => i !== item));
    } else {
      setter([...array, item]);
    }
  };

  const onSubmit = async (data: ProfileFormData) => {
    console.log('🔵 ProfileWizard Submit Started!', data);
    console.log('📊 Form data:', JSON.stringify(data, null, 2));
    setIsSubmitting(true);

    try {
      // Validate required fields before submission
      if (!data.full_name || data.full_name.trim().length < 2) {
        throw new Error('Full name is required and must be at least 2 characters');
      }

      // Clean up the data before sending to backend
      const cleanedData: ProfileUpdateData = {
        full_name: data.full_name?.trim() || undefined,
        job_title: data.job_title?.trim() || undefined,
        company: data.company?.trim() || undefined,
        industry: data.industry?.trim() || undefined,
        interests: data.interests && data.interests.length > 0 ? data.interests : undefined,
        communication_style: data.communication_style || undefined,
        primary_goals: data.primary_goals && data.primary_goals.length > 0 ? data.primary_goals : undefined,
        preferred_response_length: data.preferred_response_length || undefined,
      };

      console.log('🧹 Cleaned data for backend:', JSON.stringify(cleanedData, null, 2));
      console.log('📤 Calling onComplete with cleaned data...');
      const result = await onComplete(cleanedData);
      console.log('✅ ProfileWizard Submit Success:', result);
    } catch (error) {
      console.error('❌ ProfileWizard Submit Error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        data: data
      });

      // Re-throw the error so the calling component can handle it
      throw error;
    } finally {
      console.log('🔄 ProfileWizard Submit Finished, isSubmitting set to false');
      setIsSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="text-4xl mb-4">👋</div>
              <h2 className="text-2xl font-bold">Welcome! Let's get to know you</h2>
              <p className="text-muted-foreground">
                This helps us personalize your experience
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="full_name">What's your name? *</Label>
                <Input
                  id="full_name"
                  {...register('full_name')}
                  placeholder="e.g., Alex Morgan"
                  className="mt-1"
                />
                {errors.full_name && (
                  <p className="text-sm text-destructive mt-1">{errors.full_name.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="job_title">What do you do?</Label>
                <Input
                  id="job_title"
                  {...register('job_title')}
                  placeholder="e.g., Software Engineer, Student, Entrepreneur"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="company">Where do you work/study? (Optional)</Label>
                <Input
                  id="company"
                  {...register('company')}
                  placeholder="e.g., TechCorp, MIT, Freelance"
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <Briefcase className="h-12 w-12 mx-auto text-primary" />
              <h2 className="text-2xl font-bold">Your Professional World</h2>
              <p className="text-muted-foreground">
                Help us understand your domain
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="industry">What industry are you in?</Label>
                <Input
                  id="industry"
                  {...register('industry')}
                  placeholder="e.g., Technology, Healthcare, Education, Finance"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>How do you prefer to communicate?</Label>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {(['formal', 'casual', 'technical'] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setValue('communication_style', style)}
                      className={`p-4 border-2 rounded-lg text-center transition-all ${
                        watch('communication_style') === style
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="font-medium capitalize">{style}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {style === 'formal' && 'Professional'}
                        {style === 'casual' && 'Friendly'}
                        {style === 'technical' && 'Precise'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <Heart className="h-12 w-12 mx-auto text-primary" />
              <h2 className="text-2xl font-bold">What interests you?</h2>
              <p className="text-muted-foreground">
                Select topics you care about (choose as many as you like)
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {suggestedInterests.map((interest) => (
                <Badge
                  key={interest}
                  variant={interests.includes(interest) ? 'default' : 'outline'}
                  className="cursor-pointer px-4 py-2 text-sm"
                  onClick={() =>
                    toggleArrayItem(interests, interest, (newInterests) =>
                      setValue('interests', newInterests)
                    )
                  }
                >
                  {interests.includes(interest) && <Check className="h-3 w-3 mr-1" />}
                  {interest}
                </Badge>
              ))}
            </div>

            <div className="text-center text-sm text-muted-foreground">
              Selected: {interests.length} {interests.length === 1 ? 'interest' : 'interests'}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <Target className="h-12 w-12 mx-auto text-primary" />
              <h2 className="text-2xl font-bold">What are your goals?</h2>
              <p className="text-muted-foreground">
                How do you plan to use Memory Bay?
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {suggestedGoals.map((goal) => (
                <Badge
                  key={goal}
                  variant={goals.includes(goal) ? 'default' : 'outline'}
                  className="cursor-pointer px-4 py-2 text-sm"
                  onClick={() =>
                    toggleArrayItem(goals, goal, (newGoals) =>
                      setValue('primary_goals', newGoals)
                    )
                  }
                >
                  {goals.includes(goal) && <Check className="h-3 w-3 mr-1" />}
                  {goal}
                </Badge>
              ))}
            </div>

            <div className="text-center text-sm text-muted-foreground">
              Selected: {goals.length} {goals.length === 1 ? 'goal' : 'goals'}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <MessageSquare className="h-12 w-12 mx-auto text-primary" />
              <h2 className="text-2xl font-bold">One last thing...</h2>
              <p className="text-muted-foreground">
                How detailed should AI responses be?
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {([
                { value: 'brief', label: 'Brief', desc: 'Quick & concise' },
                { value: 'medium', label: 'Balanced', desc: 'Just right' },
                { value: 'detailed', label: 'Detailed', desc: 'Comprehensive' },
              ] as const).map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue('preferred_response_length', value)}
                  className={`p-6 border-2 rounded-lg text-center transition-all ${
                    watch('preferred_response_length') === value
                      ? 'border-primary bg-primary/10 scale-105'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="font-bold text-lg">{label}</div>
                  <div className="text-sm text-muted-foreground mt-1">{desc}</div>
                </button>
              ))}
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-6">
              <div className="flex items-start space-x-3">
                <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Ready to go!</p>
                  <p className="text-muted-foreground">
                    Your AI assistant will now understand you better and provide personalized responses.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between mb-2">
          <CardTitle className="text-xl">Profile Setup</CardTitle>
          <span className="text-sm text-muted-foreground">
            Step {step} of {totalSteps}
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          {renderStep()}

          <div className="flex items-center justify-between mt-8 pt-6 border-t">
            <Button
              type="button"
              variant="ghost"
              onClick={() => step > 1 ? setStep(step - 1) : onSkip?.()}
              disabled={isSubmitting}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {step === 1 ? 'Skip' : 'Back'}
            </Button>

            {step < totalSteps ? (
              <Button
                type="button"
                onClick={() => setStep(step + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Complete Setup'}
                <Sparkles className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}