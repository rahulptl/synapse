import { useState, useEffect } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

export interface SearchFilters {
  query: string;
  contentType: 'all' | 'text' | 'url' | 'file';
  sortBy: 'date' | 'title' | 'type';
  sortOrder: 'asc' | 'desc';
}

interface MobileSearchBarProps {
  onSearchChange: (filters: SearchFilters) => void;
  placeholder?: string;
  itemCount?: number;
}

/**
 * Mobile search bar with filters
 * Sticky positioned with search input and filter drawer
 */
export function MobileSearchBar({
  onSearchChange,
  placeholder = 'Search items...',
  itemCount = 0,
}: MobileSearchBarProps) {
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    contentType: 'all',
    sortBy: 'date',
    sortOrder: 'desc',
  });

  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(filters);
    }, 300);

    return () => clearTimeout(timer);
  }, [filters, onSearchChange]);

  const handleQueryChange = (value: string) => {
    setFilters((prev) => ({ ...prev, query: value }));
  };

  const handleClearSearch = () => {
    setFilters((prev) => ({ ...prev, query: '' }));
  };

  const handleContentTypeChange = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      contentType: value as SearchFilters['contentType'],
    }));
  };

  const handleSortByChange = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      sortBy: value as SearchFilters['sortBy'],
    }));
  };

  const handleSortOrderChange = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      sortOrder: value as SearchFilters['sortOrder'],
    }));
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.contentType !== 'all') count++;
    if (filters.sortBy !== 'date') count++;
    if (filters.sortOrder !== 'desc') count++;
    return count;
  };

  const hasActiveFilters = getActiveFilterCount() > 0;

  return (
    <div className="sticky top-0 z-20 bg-gradient-to-br from-slate-950 via-gray-900 to-slate-800 border-b border-white/10 backdrop-blur-xl shadow-lg">
      <div className="p-3 space-y-2">
        {/* Search Input Row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={filters.query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder={placeholder}
              className="pl-10 pr-10 h-11 bg-white/10 border-white/20 text-white placeholder:text-gray-400 focus:bg-white/15 focus:border-blue-500/50"
            />
            {filters.query && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter Button */}
          <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 bg-white/10 border-white/20 hover:bg-white/15 relative"
              >
                <SlidersHorizontal className="h-5 w-5 text-white" />
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {getActiveFilterCount()}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-80 bg-gradient-to-br from-slate-950 via-gray-900 to-slate-800 border-l border-white/10"
            >
              <SheetHeader className="border-b border-white/10 pb-4">
                <SheetTitle className="text-white">Filter & Sort</SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Content Type Filter */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-white">Content Type</Label>
                  <RadioGroup
                    value={filters.contentType}
                    onValueChange={handleContentTypeChange}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="all" id="type-all" />
                      <Label htmlFor="type-all" className="text-gray-300 cursor-pointer">
                        All Types
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="text" id="type-text" />
                      <Label htmlFor="type-text" className="text-gray-300 cursor-pointer">
                        Text
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="url" id="type-url" />
                      <Label htmlFor="type-url" className="text-gray-300 cursor-pointer">
                        URL
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="file" id="type-file" />
                      <Label htmlFor="type-file" className="text-gray-300 cursor-pointer">
                        File
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Sort By */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-white">Sort By</Label>
                  <RadioGroup value={filters.sortBy} onValueChange={handleSortByChange}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="date" id="sort-date" />
                      <Label htmlFor="sort-date" className="text-gray-300 cursor-pointer">
                        Date
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="title" id="sort-title" />
                      <Label htmlFor="sort-title" className="text-gray-300 cursor-pointer">
                        Title
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="type" id="sort-type" />
                      <Label htmlFor="sort-type" className="text-gray-300 cursor-pointer">
                        Type
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Sort Order */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-white">Sort Order</Label>
                  <RadioGroup value={filters.sortOrder} onValueChange={handleSortOrderChange}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="desc" id="order-desc" />
                      <Label htmlFor="order-desc" className="text-gray-300 cursor-pointer">
                        Newest First
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="asc" id="order-asc" />
                      <Label htmlFor="order-asc" className="text-gray-300 cursor-pointer">
                        Oldest First
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Active Filters & Item Count */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            {filters.contentType !== 'all' && (
              <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                {filters.contentType}
              </Badge>
            )}
            {filters.sortBy !== 'date' && (
              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                Sort: {filters.sortBy}
              </Badge>
            )}
          </div>
          <span className="text-gray-400 font-medium">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>
    </div>
  );
}
