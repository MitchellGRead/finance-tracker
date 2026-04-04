#!/usr/bin/env tsx
/**
 * Quick validation script for skills - minimal version
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

interface ValidationResult {
    valid: boolean;
    message: string;
}

function validateSkill(skillPath: string): ValidationResult {
    /** Basic validation of a skill */
    const resolvedPath = resolve(skillPath);

    // Check SKILL.md exists
    const skillMdPath = resolve(resolvedPath, 'SKILL.md');
    if (!existsSync(skillMdPath)) {
        return { valid: false, message: 'SKILL.md not found' };
    }

    // Read and validate frontmatter
    const content = readFileSync(skillMdPath, 'utf-8');
    if (!content.startsWith('---')) {
        return { valid: false, message: 'No YAML frontmatter found' };
    }

    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
        return { valid: false, message: 'Invalid frontmatter format' };
    }

    const frontmatter = frontmatterMatch[1];

    // Check required fields
    if (!frontmatter.includes('name:')) {
        return { valid: false, message: "Missing 'name' in frontmatter" };
    }
    if (!frontmatter.includes('description:')) {
        return { valid: false, message: "Missing 'description' in frontmatter" };
    }

    // Extract name for validation
    const nameMatch = frontmatter.match(/name:\s*(.+)/);
    if (nameMatch) {
        const name = nameMatch[1].trim();
        // Check naming convention (hyphen-case: lowercase with hyphens)
        if (!/^[a-z0-9-]+$/.test(name)) {
            return {
                valid: false,
                message: `Name '${name}' should be hyphen-case (lowercase letters, digits, and hyphens only)`
            };
        }
        if (name.startsWith('-') || name.endsWith('-') || name.includes('--')) {
            return {
                valid: false,
                message: `Name '${name}' cannot start/end with hyphen or contain consecutive hyphens`
            };
        }
    }

    // Extract and validate description
    const descMatch = frontmatter.match(/description:\s*(.+)/);
    if (descMatch) {
        const description = descMatch[1].trim();
        // Check for angle brackets
        if (description.includes('<') || description.includes('>')) {
            return {
                valid: false,
                message: 'Description cannot contain angle brackets (< or >)'
            };
        }
    }

    return { valid: true, message: 'Skill is valid!' };
}

function main() {
    const args = process.argv.slice(2);

    if (args.length !== 1) {
        console.log('Usage: tsx quick_validate.ts <skill_directory>');
        process.exit(1);
    }

    const { valid, message } = validateSkill(args[0]);
    console.log(message);
    process.exit(valid ? 0 : 1);
}

main();
