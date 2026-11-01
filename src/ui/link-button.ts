// Button styles for a router <Link>. cn merges the variant classes, as <Button> does, so that
// an outline variant's border wins over the base border-transparent.
import type { VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { buttonVariants } from '@/components/ui/button';

export const linkButton = (variants?: VariantProps<typeof buttonVariants>) => cn(buttonVariants(variants));
