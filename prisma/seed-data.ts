/**
 * Source lists for the demo dataset (spec §39).
 *
 * Names are drawn from common Indian given and family names to match the
 * demo organisation's setting (AADRIQUE Medical Center, Hyderabad). Nothing
 * here refers to a real person.
 */

export const FIRST_NAMES_FEMALE = [
  "Priya", "Meena", "Ananya", "Kavitha", "Lakshmi", "Divya", "Sneha", "Radha",
  "Swathi", "Pooja", "Nandini", "Bhavana", "Sridevi", "Aishwarya", "Rekha",
  "Padma", "Harini", "Vidya", "Manjula", "Sushma", "Deepika", "Anjali",
  "Sowmya", "Keerthi", "Madhavi",
];

export const FIRST_NAMES_MALE = [
  "Ravi", "Arjun", "Vikram", "Suresh", "Rajesh", "Karthik", "Naveen", "Anil",
  "Mahesh", "Srinivas", "Praveen", "Kiran", "Sandeep", "Venkat", "Ramesh",
  "Ashok", "Gopal", "Harish", "Manoj", "Prakash", "Sai", "Teja", "Vinod",
  "Yashwanth", "Chandra",
];

export const LAST_NAMES = [
  "Sharma", "Kumar", "Rao", "Reddy", "Naidu", "Patel", "Menon", "Nair",
  "Iyer", "Gupta", "Verma", "Joshi", "Desai", "Chowdary", "Prasad",
  "Bhat", "Pillai", "Shetty", "Agarwal", "Mishra", "Singh", "Krishnan",
];

export const DEPARTMENTS = [
  { name: "General Medicine", code: "GEN", waitThresholdMinutes: 20, queueCapacity: 6 },
  { name: "Pediatrics", code: "PED", waitThresholdMinutes: 15, queueCapacity: 5 },
  { name: "Dermatology", code: "DERM", waitThresholdMinutes: 25, queueCapacity: 4 },
  { name: "Cardiology", code: "CARD", waitThresholdMinutes: 30, queueCapacity: 4 },
  { name: "Orthopedics", code: "ORTHO", waitThresholdMinutes: 25, queueCapacity: 5 },
];

export const DOCTORS = [
  {
    name: "Dr. Ananya Rao",
    email: "ananya.rao@aadrique.demo",
    department: "GEN",
    specialization: "Internal Medicine",
    qualifications: "MBBS, MD (General Medicine)",
    experienceYears: 12,
    consultationMinutes: 15,
    tokenPrefix: "A",
  },
  {
    name: "Dr. Vikram Reddy",
    email: "vikram.reddy@aadrique.demo",
    department: "CARD",
    specialization: "Interventional Cardiology",
    qualifications: "MBBS, MD, DM (Cardiology)",
    experienceYears: 18,
    consultationMinutes: 20,
    tokenPrefix: "C",
  },
  {
    name: "Dr. Sneha Menon",
    email: "sneha.menon@aadrique.demo",
    department: "PED",
    specialization: "Neonatology",
    qualifications: "MBBS, MD (Pediatrics)",
    experienceYears: 9,
    consultationMinutes: 15,
    tokenPrefix: "P",
  },
  {
    name: "Dr. Karthik Iyer",
    email: "karthik.iyer@aadrique.demo",
    department: "DERM",
    specialization: "Clinical Dermatology",
    qualifications: "MBBS, MD (Dermatology)",
    experienceYears: 7,
    consultationMinutes: 12,
    tokenPrefix: "D",
  },
  {
    name: "Dr. Rajesh Naidu",
    email: "rajesh.naidu@aadrique.demo",
    department: "ORTHO",
    specialization: "Joint Replacement",
    qualifications: "MBBS, MS (Orthopedics)",
    experienceYears: 15,
    consultationMinutes: 20,
    tokenPrefix: "O",
  },
];

/** Presenting complaints, grouped by the department that usually sees them. */
export const COMPLAINTS: Record<string, string[]> = {
  GEN: [
    "Fever for three days",
    "Persistent cough and cold",
    "Headache and fatigue",
    "Acidity and abdominal discomfort",
    "Routine diabetes review",
    "Blood pressure review",
    "Generalised body ache",
    "Dizziness on standing",
  ],
  CARD: [
    "Chest discomfort on exertion",
    "Palpitations in the evening",
    "Breathlessness climbing stairs",
    "Post-angioplasty review",
    "Hypertension follow-up",
    "Swelling of both ankles",
  ],
  PED: [
    "Fever with reduced feeding",
    "Recurrent cold and cough",
    "Routine immunisation review",
    "Loose stools for two days",
    "Growth and development check",
    "Skin rash after fever",
  ],
  DERM: [
    "Itchy rash on forearms",
    "Hair fall for three months",
    "Acne not settling with creams",
    "Fungal infection in skin folds",
    "Dry scaly patches on legs",
    "Pigmentation on the face",
  ],
  ORTHO: [
    "Knee pain while climbing stairs",
    "Lower back pain after lifting",
    "Shoulder stiffness at night",
    "Ankle sprain two weeks ago",
    "Post-operative knee review",
    "Wrist pain with typing",
  ],
};

export const CONDITIONS = [
  { name: "Type 2 Diabetes Mellitus", code: "E11" },
  { name: "Essential Hypertension", code: "I10" },
  { name: "Bronchial Asthma", code: "J45" },
  { name: "Hypothyroidism", code: "E03" },
  { name: "Dyslipidemia", code: "E78" },
  { name: "Osteoarthritis of knee", code: "M17" },
  { name: "Iron deficiency anaemia", code: "D50" },
  { name: "Gastro-oesophageal reflux disease", code: "K21" },
];

export const ALLERGENS = [
  { substance: "Penicillin", reaction: "Rash and itching" },
  { substance: "Sulfa drugs", reaction: "Urticaria" },
  { substance: "Peanuts", reaction: "Swelling of lips" },
  { substance: "Dust mites", reaction: "Sneezing and wheeze" },
  { substance: "Iodinated contrast", reaction: "Nausea and flushing" },
  { substance: "Aspirin", reaction: "Gastric irritation" },
  { substance: "Latex", reaction: "Contact dermatitis" },
];

export const PATIENT_FLAGS = [
  "Interpreter needed",
  "Hard of hearing",
  "Wheelchair access",
  "Pregnant",
  "Needs attendant",
];

export const MEDICATIONS = [
  { name: "Paracetamol", genericName: "Acetaminophen", form: "Tablet", strength: "500 mg" },
  { name: "Amoxicillin", genericName: "Amoxicillin", form: "Capsule", strength: "500 mg" },
  { name: "Metformin", genericName: "Metformin HCl", form: "Tablet", strength: "500 mg" },
  { name: "Amlodipine", genericName: "Amlodipine besylate", form: "Tablet", strength: "5 mg" },
  { name: "Atorvastatin", genericName: "Atorvastatin calcium", form: "Tablet", strength: "10 mg" },
  { name: "Pantoprazole", genericName: "Pantoprazole sodium", form: "Tablet", strength: "40 mg" },
  { name: "Cetirizine", genericName: "Cetirizine HCl", form: "Tablet", strength: "10 mg" },
  { name: "Levothyroxine", genericName: "Levothyroxine sodium", form: "Tablet", strength: "50 mcg" },
  { name: "Salbutamol", genericName: "Albuterol", form: "Inhaler", strength: "100 mcg" },
  { name: "Ibuprofen", genericName: "Ibuprofen", form: "Tablet", strength: "400 mg" },
  { name: "Azithromycin", genericName: "Azithromycin", form: "Tablet", strength: "500 mg" },
  { name: "ORS", genericName: "Oral rehydration salts", form: "Sachet", strength: "21 g" },
];

export const LAB_PANELS = [
  { testName: "Complete Blood Count", panel: "Haematology" },
  { testName: "HbA1c", panel: "Diabetes" },
  { testName: "Lipid Profile", panel: "Biochemistry" },
  { testName: "Thyroid Function Test", panel: "Endocrine" },
  { testName: "Liver Function Test", panel: "Biochemistry" },
  { testName: "Serum Creatinine", panel: "Renal" },
  { testName: "Vitamin D (25-OH)", panel: "Biochemistry" },
  { testName: "Chest X-Ray PA view", panel: "Radiology" },
];

export const FREQUENCIES = [
  "Once daily", "Twice daily", "Three times daily",
  "Once at night", "Every 8 hours", "As needed",
];

export const DOSE_INSTRUCTIONS = [
  "After food", "Before food", "With plenty of water",
  "After breakfast", "At bedtime",
];
