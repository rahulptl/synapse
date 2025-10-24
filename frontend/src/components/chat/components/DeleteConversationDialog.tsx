import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

interface DeleteConversationDialogProps {
  conversationToDelete: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
}

export const DeleteConversationDialog = ({
  conversationToDelete,
  onOpenChange,
  onConfirmDelete
}: DeleteConversationDialogProps) => {
  return (
    <AlertDialog open={conversationToDelete !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-slate-900 border border-red-500/30">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span>Delete Conversation</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-300">
            Are you sure you want to delete this conversation? This action cannot be undone and all messages will be permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-white/10 text-white hover:bg-white/20 border-white/20">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmDelete}
            className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};