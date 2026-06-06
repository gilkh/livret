type StudentSex = 'female' | 'male' | null

const normalizeText = (value: unknown) => String(value ?? '').trim()

const normalizeStudentSex = (value: unknown): StudentSex => {
  if (value === 'female' || value === 'male') return value
  return null
}

const findMatchingAppreciation = (dropdownBlock: any, rawValue: unknown) => {
  const selected = normalizeText(rawValue)
  if (!selected) return null

  const appreciations = Array.isArray(dropdownBlock?.props?.appreciations)
    ? dropdownBlock.props.appreciations
    : []

  return appreciations.find((entry: any) => normalizeText(entry?.option) === selected) || null
}

export const findDropdownBlockByReference = (pages: any[], reference: any) => {
  const targetBlockId = normalizeText(reference?.blockId)
  const targetDropdownNumber = reference?.dropdownNumber

  for (const page of Array.isArray(pages) ? pages : []) {
    for (const block of Array.isArray(page?.blocks) ? page.blocks : []) {
      if (block?.type !== 'dropdown') continue
      const blockId = normalizeText(block?.props?.blockId)
      if (targetBlockId && blockId === targetBlockId) return block
      if (!targetBlockId && targetDropdownNumber != null && block?.props?.dropdownNumber === targetDropdownNumber) {
        return block
      }
    }
  }

  return null
}

export const resolveDropdownDisplayValue = ({
  dropdownBlock,
  rawValue,
  studentSex,
  studentFirstName,
  studentLastName,
}: {
  dropdownBlock: any
  rawValue: unknown
  studentSex?: unknown
  studentFirstName?: string
  studentLastName?: string
}) => {
  const selected = normalizeText(rawValue)
  if (!selected) return ''

  const appreciation = findMatchingAppreciation(dropdownBlock, selected)
  if (!appreciation) return selected

  const sex = normalizeStudentSex(studentSex)
  let result = selected
  if (sex === 'female') result = normalizeText(appreciation?.femaleText) || selected
  else if (sex === 'male') result = normalizeText(appreciation?.maleText) || selected

  // Replace student name placeholders
  result = result.replace(/<<first_name>>/g, studentFirstName || '')
  result = result.replace(/<<last_name>>/g, studentLastName || '')

  return result
}
