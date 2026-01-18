# 📋 Implementation Plan: Admin PS-to-MS Onboarding Page

## ✅ IMPLEMENTATION COMPLETE (January 18, 2026)

## 🎯 Overview

This new admin page enables the administrator to onboard students from **PS (Petite Section)** into **MS (Moyenne Section)** while preserving their historical data. 

### Key Goals:
1. **Import PS students** and assign them to their **correct previous-year PS class**
2. **Sign their gradebooks** (Semester 1 and Semester 2) using admin or subadmin signatures
3. **Batch promote** students to MS level
4. **Preserve historical data** (signatures, dropdowns, previous class info)

### Post-Promotion Flow:
After promotion, students will appear in the **Resources page as "promoted"** (same as subadmin promotion flow). Admin can then:
1. Download the students list
2. Assign new MS classes
3. Re-upload to give them new class assignments

---

## 🏗️ Architecture

### Files to Create

| File | Purpose |
|------|---------|
| `client/src/pages/AdminPsOnboarding.tsx` | Main admin page component |
| `client/src/pages/AdminPsOnboarding.css` | Styling for the page |

### Files to Modify

| File | Modification |
|------|-------------|
| `client/src/App.tsx` | Add route for new page |
| `server/src/routes/adminExtras.ts` | Add new API endpoints |
| `server/src/routes/settings.ts` | Add per-level dropdown editability settings |
| `client/src/pages/AdminSettings.tsx` | Add toggles for dropdown editability per level |

---

## 📑 Phase 1: Backend API Endpoints

### 1.1 `GET /admin/ps-onboarding/students`

**Purpose:** Fetch all PS students needing onboarding

```typescript
// Query params: 
// - schoolYearId: string (previous year)

// Response:
{
  students: [{
    _id: string,
    firstName: string,
    lastName: string,
    dateOfBirth: string,
    avatarUrl?: string,
    previousClassName?: string,  // From enrollment or manual assignment
    previousClassId?: string,
    assignment?: {
      _id: string,
      isCompletedSem1: boolean,
      isCompletedSem2: boolean,
      data?: any
    },
    signatures: {
      sem1: { signedAt?: Date, subAdminId?: string } | null,
      sem2: { signedAt?: Date, subAdminId?: string } | null
    },
    isPromoted: boolean,
    promotedAt?: Date
  }],
  previousYear: { _id: string, name: string },
  previousYearClasses: [{ _id: string, name: string, level: string }]
}
```

### 1.2 `POST /admin/ps-onboarding/assign-class`

**Purpose:** Assign a PS student to their previous-year PS class

```typescript
// Request body:
{
  studentId: string,
  classId: string,        // The PS class to assign
  schoolYearId: string    // Previous year ID
}

// This creates/updates an Enrollment for the student in the previous year
```

### 1.3 `POST /admin/ps-onboarding/batch-sign`

**Purpose:** Batch sign gradebooks for multiple students

```typescript
// Request body:
{
  scope: 'student' | 'class' | 'all',
  studentIds?: string[],        // If scope = 'student'
  classId?: string,             // If scope = 'class'
  signatureType: 'sem1' | 'sem2' | 'both',
  signatureSource: 'admin' | 'subadmin',
  subadminId?: string,          // Required if signatureSource = 'subadmin'
  schoolYearId: string          // Previous year ID
}

// Response:
{
  success: number,
  failed: number,
  errors: [{ studentId: string, error: string }]
}
```

### 1.4 `POST /admin/ps-onboarding/batch-unsign`

**Purpose:** Undo batch signatures (rollback capability)

```typescript
// Request body:
{
  scope: 'student' | 'class' | 'all',
  studentIds?: string[],
  classId?: string,
  signatureType: 'sem1' | 'sem2' | 'both',
  schoolYearId: string
}
```

### 1.5 `POST /admin/ps-onboarding/batch-promote`

**Purpose:** Batch promote students from PS to MS

```typescript
// Request body:
{
  scope: 'student' | 'class' | 'all',
  studentIds?: string[],
  classId?: string,
  schoolYearId: string    // Previous year ID (where promotions happen FROM)
}

// Response:
{
  success: number,
  failed: number,
  errors: [{ studentId: string, error: string }]
}
```

### 1.6 Per-Level Dropdown Editability Settings

**New settings keys:**
- `previous_year_dropdown_editable_PS` (boolean)
- `previous_year_dropdown_editable_MS` (boolean)
- `previous_year_dropdown_editable_GS` (boolean)

---

## 📑 Phase 2: Frontend - Page Structure

### 2.1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ 📚 Onboarding PS → MS                                    [Back] │
│ Préparer les élèves PS pour leur passage en MS                  │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│ │ 👥 25       │ │ ✅ 10       │ │ ✍️ 8        │ │ 🎓 5        │ │
│ │ Total       │ │ Classés     │ │ Signés      │ │ Promus      │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ Filtres: [Classe ▼] [Status ▼]     [☐ Tout sélectionner]        │
├─────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ PS A (8 élèves)                                           │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ ☐ 👤 Jean Dupont     [Sem1: ✅] [Sem2: ⏳] [Promu: ❌]    │   │
│ │ ☐ 👤 Marie Martin    [Sem1: ✅] [Sem2: ✅] [Promu: ✅]    │   │
│ │ ...                                                       │   │
│ └───────────────────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ Non affectés (5 élèves)                                   │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ ☐ 👤 Paul Bernard    [Classe: ▼ Sélectionner]             │   │
│ └───────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│ ACTIONS EN LOT                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Signature: [◉ Admin ○ Sous-admin: ▼]                       │ │
│ │ [✍️ Signer Sem1] [✍️ Signer Sem2] [✍️ Signer Les Deux]    │ │
│ │ [↩️ Annuler Signatures]                                    │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ [🎓 Promouvoir Sélection] [🎓 Promouvoir Tout]             │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 State Structure

```typescript
interface StudentOnboarding {
  _id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  avatarUrl?: string
  previousClassName?: string
  previousClassId?: string
  assignmentId?: string
  signatures: {
    sem1: { signedAt: Date, signedBy: string } | null
    sem2: { signedAt: Date, signedBy: string } | null
  }
  isPromoted: boolean
  promotedAt?: Date
}

// Component state
const [students, setStudents] = useState<StudentOnboarding[]>([])
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
const [previousYearClasses, setPreviousYearClasses] = useState<Class[]>([])
const [previousYear, setPreviousYear] = useState<SchoolYear | null>(null)
const [subadmins, setSubadmins] = useState<User[]>([])
const [adminSignature, setAdminSignature] = useState<string | null>(null)

// Filter state
const [filterClass, setFilterClass] = useState<string>('all')
const [filterStatus, setFilterStatus] = useState<'all' | 'unsigned' | 'signed' | 'promoted'>('all')

// Action state
const [signatureSource, setSignatureSource] = useState<'admin' | 'subadmin'>('admin')
const [selectedSubadminId, setSelectedSubadminId] = useState<string>('')
const [processing, setProcessing] = useState(false)
```

---

## 📑 Phase 3: Admin Settings Addition

### 3.1 New Section in AdminSettings.tsx

```tsx
// Add under "signature" section or create new "Previous Year Options" section
<SectionCard id="previous-year">
  <div className="setting-item">
    <div className="setting-info">
      <h3>🔓 Dropdowns PS Année Précédente</h3>
      <p>Permettre la modification des listes déroulantes pour les données PS des années précédentes</p>
    </div>
    <div className="setting-actions">
      <Toggle 
        checked={dropdownEditablePS} 
        onChange={() => toggleSetting('previous_year_dropdown_editable_PS', dropdownEditablePS, setDropdownEditablePS)} 
      />
    </div>
  </div>
  
  <div className="setting-item">
    <div className="setting-info">
      <h3>🔓 Dropdowns MS Année Précédente</h3>
      <p>Permettre la modification des listes déroulantes pour les données MS des années précédentes</p>
    </div>
    <div className="setting-actions">
      <Toggle 
        checked={dropdownEditableMS} 
        onChange={() => toggleSetting('previous_year_dropdown_editable_MS', dropdownEditableMS, setDropdownEditableMS)} 
      />
    </div>
  </div>
  
  <div className="setting-item">
    <div className="setting-info">
      <h3>🔓 Dropdowns GS Année Précédente</h3>
      <p>Permettre la modification des listes déroulantes pour les données GS des années précédentes</p>
    </div>
    <div className="setting-actions">
      <Toggle 
        checked={dropdownEditableGS} 
        onChange={() => toggleSetting('previous_year_dropdown_editable_GS', dropdownEditableGS, setDropdownEditableGS)} 
      />
    </div>
  </div>
</SectionCard>
```

---

## 📑 Phase 4: Implementation Order

| Step | Task | Est. Time |
|------|------|-----------|
| 1 | Create backend endpoint: `GET /admin/ps-onboarding/students` | 30 min |
| 2 | Create backend endpoint: `POST /admin/ps-onboarding/assign-class` | 20 min |
| 3 | Create backend endpoint: `POST /admin/ps-onboarding/batch-sign` | 45 min |
| 4 | Create backend endpoint: `POST /admin/ps-onboarding/batch-unsign` | 20 min |
| 5 | Create backend endpoint: `POST /admin/ps-onboarding/batch-promote` | 45 min |
| 6 | Add per-level dropdown settings to backend | 15 min |
| 7 | Create `AdminPsOnboarding.tsx` component | 60 min |
| 8 | Create `AdminPsOnboarding.css` styling | 30 min |
| 9 | Add route to `App.tsx` | 5 min |
| 10 | Add settings toggles to `AdminSettings.tsx` | 20 min |
| 11 | Testing & refinement | 30 min |

**Total Estimated Time: ~5 hours**

---

## 🔄 Data Flow Diagram

```
┌─────────────────┐
│ Resources Page  │
│ Import PS       │
│ Students CSV    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ PS Onboarding   │
│ Page            │
│ 1. Assign Class │
│ 2. Sign Sem1+2  │
│ 3. Promote      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Resources Page  │
│ "Promoted"      │
│ Section         │
│ - Download CSV  │
│ - Add MS Class  │
│ - Re-upload     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Students now    │
│ in MS with      │
│ PS history      │
│ preserved       │
└─────────────────┘
```

---

## 🔐 Security & Validation

1. **Admin-only access**: All endpoints require `ADMIN` role
2. **Audit logging**: Log all sign/unsign/promote operations
3. **Validation rules**:
   - Cannot sign without class assignment
   - Cannot promote without Sem2 (end_of_year) signature
   - Cannot promote already-promoted students
4. **Rollback**: Unsign capability for error recovery

---

## 🎨 UI/UX Guidelines

1. **Premium aesthetic** matching existing admin pages
2. **Clear visual hierarchy** with stats cards at top
3. **Grouped display** by class for easy management
4. **Color-coded status badges**:
   - ✅ Green: Completed/Signed/Promoted
   - ⏳ Yellow: Pending
   - ❌ Red: Not done
5. **Confirmation dialogs**: 3x confirm for batch promote
6. **Progress indicators**: Show count during batch operations
7. **Toast notifications**: Success/error feedback

---

## ❓ Resolved Clarifications

| Question | Answer |
|----------|--------|
| Support multiple levels? | No, PS→MS only for now |
| Already promoted students? | Appear in Resources page as "promoted" |
| Undo option? | Yes, batch unsign capability included |
| Dropdown editability scope? | Per level (PS, MS, GS separately) |

---

## 📝 Notes

- This page is specifically for **admin use** to onboard students who were imported for a new year but need their PS history set up
- After promotion, the normal Resources page flow handles MS class assignment
- The dropdown editability settings affect how SubAdmins/Teachers see previous year dropdowns throughout the app (not just this page)
