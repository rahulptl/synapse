import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, Folder, Download, AlertTriangle } from 'lucide-react';
import type { SelectedSource } from '../types/chat';

interface SourceContentDialogProps {
  showSourceDialog: boolean;
  setShowSourceDialog: (open: boolean) => void;
  selectedSource: SelectedSource | null;
  onDownloadSourceFile: (source: SelectedSource) => void;
}

export const SourceContentDialog = ({
  showSourceDialog,
  setShowSourceDialog,
  selectedSource,
  onDownloadSourceFile
}: SourceContentDialogProps) => {
  return (
    <Dialog open={showSourceDialog} onOpenChange={setShowSourceDialog}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Search className="h-4 w-4" />
            <span>Source Content</span>
          </DialogTitle>
        </DialogHeader>

        {selectedSource && (
          <div className="space-y-4">
            {/* Source Info */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <h3 className="font-medium">{selectedSource.title}</h3>
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <div className="flex items-center space-x-1">
                    <Folder className="h-3 w-3" />
                    <span>{selectedSource.source}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {Math.round(selectedSource.similarity * 100)}% match
                  </Badge>
                  {selectedSource.contentType && (
                    <Badge variant="outline" className="text-xs uppercase">
                      {selectedSource.contentType}
                    </Badge>
                  )}
                </div>
              </div>
              {/* Download Button */}
              {selectedSource.fileMetadata?.original_filename && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDownloadSourceFile(selectedSource)}
                  className="flex items-center space-x-2"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Original</span>
                </Button>
              )}
            </div>

            {/* Content Area */}
            <ScrollArea className="h-96 w-full border rounded-md">
              <div className="p-4">
                <div className="whitespace-pre-wrap text-sm">
                  {selectedSource.content}
                </div>
              </div>
            </ScrollArea>

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 border-t">
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <AlertTriangle className="h-3 w-3" />
                <span>This is the source content that was referenced in the AI response</span>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowSourceDialog(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};