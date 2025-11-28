# Dropdown Features Documentation

## Overview
This document describes the enhanced dropdown functionality that allows automatic numbering of dropdowns and the ability to reference their selected values throughout your templates.

## Features Implemented

### 1. Automatic Dropdown Numbering
Every dropdown added to a template is automatically assigned a unique sequential number. This number is:
- **Displayed** in the template builder with a purple badge (e.g., "Dropdown #1")
- **Persisted** with the dropdown block
- **Visible** in the teacher editing view
- **Used** as the primary key for storing and retrieving dropdown values

### 2. Dropdown Reference Block
A new block type called `dropdown_reference` has been added to the palette. This block:
- Displays the selected value from any numbered dropdown
- Updates automatically when the dropdown selection changes
- Can be placed anywhere in the template (same page or different page)
- Shows placeholder text `[Dropdown #X]` when no value is selected

### 3. PDF Generation
The PDF export has been optimized to:
- Render dropdowns with their selected values
- Show dropdown numbers for easy identification
- Display dropdown_reference blocks with the actual selected values
- Handle cases where no value has been selected yet

## How to Use

### Creating a Dropdown
1. In the Template Builder, click on the `dropdown` block in the left palette
2. The dropdown will be automatically numbered (e.g., #1, #2, #3, etc.)
3. Configure the dropdown properties in the right panel:
   - **Dropdown #**: Shows the assigned number (read-only)
   - **Label**: Optional label above the dropdown
   - **Variable Name**: Optional custom variable name
   - **Options**: Enter one option per line
   - **Width/Height**: Size of the dropdown

### Referencing a Dropdown Value
1. Add a `dropdown_reference` block from the palette
2. In the properties panel, set the **Dropdown Number** to match the dropdown you want to reference
3. The block will display the selected value whenever the dropdown is filled

### Teacher View
When teachers edit student templates:
- Dropdowns show their number (e.g., "Dropdown #1")
- Selecting a value automatically saves it
- Dropdown references update immediately to show the selected value

### PDF Export
When generating PDFs:
- Dropdowns appear as boxes with the selected value
- The dropdown number is shown for reference
- Dropdown references display the selected value in the specified location
- Empty dropdowns show "Sélectionner..." as placeholder

## Technical Details

### Data Storage
Dropdown values are stored in the `TemplateAssignment.data` object with keys:
- Primary: `dropdown_1`, `dropdown_2`, etc. (based on dropdown number)
- Legacy: Custom variable names are still supported

### Template Structure
```typescript
// Dropdown block
{
  type: 'dropdown',
  props: {
    dropdownNumber: 1,           // Automatically assigned
    label: 'Select an option',
    variableName: 'custom_var',  // Optional
    options: ['Option 1', 'Option 2'],
    width: 200,
    height: 40,
    fontSize: 12,
    color: '#333'
  }
}

// Dropdown reference block
{
  type: 'dropdown_reference',
  props: {
    dropdownNumber: 1,  // References Dropdown #1
    fontSize: 12,
    color: '#2d3436'
  }
}
```

## Example Use Cases

### 1. Student Observations
- **Dropdown #1**: "Comportement en classe" with options ["Excellent", "Bon", "Satisfaisant", "À améliorer"]
- **Dropdown Reference**: Place on summary page to show: "Comportement général: [Selected Value]"

### 2. Skills Assessment
- **Dropdown #1-5**: Individual skill ratings
- **Dropdown References**: Show selected ratings in different sections of the report

### 3. Multi-page Templates
- **Dropdown #1**: "Trimestre" on page 1
- **Dropdown Reference**: Display the selected trimester on all subsequent pages

## Benefits

1. **Consistency**: Ensure the same value appears wherever needed
2. **Efficiency**: Set a value once, use it many times
3. **Clarity**: Numbered dropdowns are easy to identify and reference
4. **Flexibility**: Place dropdown values anywhere in your template
5. **PDF Accuracy**: What you see in the editor is what appears in the PDF

## Migration Notes

- Existing templates with dropdowns will continue to work
- Old dropdowns can be updated to use the new numbering system
- Both dropdown numbers and custom variable names are supported
