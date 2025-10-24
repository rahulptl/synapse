import { useState } from 'react';
import { User, Mail, Briefcase, Building2, Target, MessageSquare, Clock, CheckCircle2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProfileWizard } from '@/components/profile/ProfileWizard';
import { ProfileImageUpload } from '@/components/profile/ProfileImageUpload';
import type { UserProfile, ProfileUpdateData } from '@/types/profile';
import { cn } from '@/lib/utils';

interface ProfileSectionProps {
  userProfile: UserProfile | null;
  onProfileUpdate: (data: ProfileUpdateData) => Promise<void>;
}

export function ProfileSection({ userProfile, onProfileUpdate }: ProfileSectionProps) {
  const [showProfileWizard, setShowProfileWizard] = useState(false);

  const handleProfileComplete = async (data: ProfileUpdateData) => {
    await onProfileUpdate(data);
    setShowProfileWizard(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">Profile</h2>
          <p className="text-muted-foreground">
            Manage your personal information and AI preferences
          </p>
        </div>
        <Button
          onClick={() => setShowProfileWizard(true)}
          className="gap-2"
        >
          <Edit className="h-4 w-4" />
          Edit Profile
        </Button>
      </div>

      {/* Profile Wizard Modal */}
      {showProfileWizard && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6">
            <ProfileWizard
              initialData={userProfile || undefined}
              onComplete={handleProfileComplete}
              onSkip={() => setShowProfileWizard(false)}
            />
          </CardContent>
        </Card>
      )}

      {userProfile && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Personal Information */}
          <Card className="hover-lift">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>Your basic profile details</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 hover:bg-sidebar-accent/50 rounded-lg transition-colors">
                  <div>
                    <div className="text-sm font-medium text-sidebar-foreground">Profile Picture</div>
                    <div className="text-xs text-sidebar-muted mt-0.5">Your profile image</div>
                  </div>
                  <ProfileImageUpload
                    avatarUrl={userProfile.avatar_url}
                    userName={userProfile.full_name || userProfile.email}
                    size="md"
                    editable={true}
                  />
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs text-muted-foreground">Full Name</Label>
                    <p className="font-medium truncate">{userProfile.full_name || 'Not set'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <p className="font-medium truncate">{userProfile.email}</p>
                  </div>
                </div>

                {userProfile.timezone && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <Label className="text-xs text-muted-foreground">Timezone</Label>
                      <p className="font-medium truncate">{userProfile.timezone}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Professional Information */}
          <Card className="hover-lift">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <Briefcase className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <CardTitle>Professional Details</CardTitle>
                  <CardDescription>Your work information</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {userProfile.job_title ? (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <Label className="text-xs text-muted-foreground">Job Title</Label>
                      <p className="font-medium truncate">{userProfile.job_title}</p>
                    </div>
                  </div>
                ) : null}

                {userProfile.company ? (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <Label className="text-xs text-muted-foreground">Company</Label>
                      <p className="font-medium truncate">{userProfile.company}</p>
                    </div>
                  </div>
                ) : null}

                {!userProfile.job_title && !userProfile.company && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No professional information added</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Interests & Goals */}
          <Card className="hover-lift md:col-span-2">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                  <Target className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <CardTitle>Interests & Goals</CardTitle>
                  <CardDescription>What drives you and what you're interested in</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {userProfile.interests && userProfile.interests.length > 0 ? (
                <div>
                  <Label className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-purple-500" />
                    Interests
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {userProfile.interests.map((interest: string) => (
                      <Badge key={interest} variant="secondary" className="px-3 py-1 text-sm">
                        {interest}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {userProfile.primary_goals && userProfile.primary_goals.length > 0 ? (
                <div>
                  <Label className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-blue-500" />
                    Primary Goals
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {userProfile.primary_goals.map((goal: string) => (
                      <Badge key={goal} className="px-3 py-1 text-sm bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 hover:bg-blue-500/20">
                        {goal}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {(!userProfile.interests || userProfile.interests.length === 0) &&
               (!userProfile.primary_goals || userProfile.primary_goals.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No interests or goals added yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Preferences */}
          <Card className="hover-lift md:col-span-2">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <MessageSquare className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <CardTitle>AI Preferences</CardTitle>
                  <CardDescription>Customize how the AI interacts with you</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <Label className="text-xs text-muted-foreground mb-2 block">Communication Style</Label>
                  <p className="font-medium capitalize flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    {userProfile.communication_style || 'Not set'}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <Label className="text-xs text-muted-foreground mb-2 block">Response Length</Label>
                  <p className="font-medium capitalize flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    {userProfile.preferred_response_length || 'Not set'}
                  </p>
                </div>

                {userProfile.topics_of_interest && userProfile.topics_of_interest.length > 0 && (
                  <div className="md:col-span-2 p-4 rounded-lg bg-muted/50">
                    <Label className="text-xs text-muted-foreground mb-2 block">Topics of Interest</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {userProfile.topics_of_interest.map((topic: string) => (
                        <Badge key={topic} variant="outline" className="text-xs">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Profile Completion Status */}
          <Card className={cn(
            "md:col-span-2 border-2 transition-all",
            userProfile.profile_completed
              ? "border-green-500/30 bg-green-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          )}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full",
                  userProfile.profile_completed ? "bg-green-500/20" : "bg-amber-500/20"
                )}>
                  <CheckCircle2 className={cn(
                    "h-6 w-6",
                    userProfile.profile_completed ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"
                  )} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">
                    {userProfile.profile_completed ? 'Profile Complete' : 'Profile Incomplete'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {userProfile.profile_completed
                      ? 'Your profile is fully set up and ready to go!'
                      : 'Complete your profile to get personalized AI responses'
                    }
                  </p>
                </div>
                {!userProfile.profile_completed && (
                  <Button onClick={() => setShowProfileWizard(true)} variant="outline">
                    Complete Profile
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!userProfile && (
        <Card>
          <CardContent className="p-12 text-center">
            <User className="h-16 w-16 mx-auto mb-4 opacity-30 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Profile Information</h3>
            <p className="text-muted-foreground mb-6">
              Start by creating your profile to personalize your experience
            </p>
            <Button onClick={() => setShowProfileWizard(true)}>
              Create Profile
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
