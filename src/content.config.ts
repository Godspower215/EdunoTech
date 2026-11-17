import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Future "Insights & Resources" section (blueprint 4.1 and 16).
// Add Markdown files to src/content/insights (or use the CMS) and the
// /insights pages build automatically. With no posts, nothing is published.
const insights = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/insights' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    category: z.enum(['Article', 'Announcement', 'Project update', 'Resource']).default('Article'),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { insights };
