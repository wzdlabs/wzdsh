export type CompetencyDefinition = {
  id: string;
  title: string;
  levelStart: number;
  levelEnd: number;
  effortHours: {
    low: number;
    high: number;
  };
  prerequisites: string[];
  passingScore: number;
};

export const pythonBackendPath: readonly CompetencyDefinition[] = [
  {
    id: "computer-terminal",
    title: "Computer and terminal foundations",
    levelStart: 0,
    levelEnd: 10,
    effortHours: { low: 20, high: 40 },
    prerequisites: [],
    passingScore: 80,
  },
  {
    id: "python-core",
    title: "Core Python",
    levelStart: 10,
    levelEnd: 20,
    effortHours: { low: 60, high: 100 },
    prerequisites: ["computer-terminal"],
    passingScore: 80,
  },
  {
    id: "problem-solving",
    title: "Problem solving and debugging",
    levelStart: 20,
    levelEnd: 30,
    effortHours: { low: 70, high: 110 },
    prerequisites: ["python-core"],
    passingScore: 80,
  },
  {
    id: "developer-tooling",
    title: "Git and developer tooling",
    levelStart: 30,
    levelEnd: 40,
    effortHours: { low: 60, high: 100 },
    prerequisites: ["problem-solving"],
    passingScore: 80,
  },
  {
    id: "professional-python",
    title: "Professional Python and testing",
    levelStart: 40,
    levelEnd: 50,
    effortHours: { low: 80, high: 130 },
    prerequisites: ["developer-tooling"],
    passingScore: 80,
  },
  {
    id: "web-data-foundations",
    title: "SQL, HTTP, and API foundations",
    levelStart: 50,
    levelEnd: 60,
    effortHours: { low: 80, high: 130 },
    prerequisites: ["professional-python"],
    passingScore: 80,
  },
  {
    id: "backend-development",
    title: "Python backend development",
    levelStart: 60,
    levelEnd: 70,
    effortHours: { low: 110, high: 170 },
    prerequisites: ["web-data-foundations"],
    passingScore: 80,
  },
  {
    id: "production-systems",
    title: "Production systems",
    levelStart: 70,
    levelEnd: 80,
    effortHours: { low: 90, high: 140 },
    prerequisites: ["backend-development"],
    passingScore: 80,
  },
  {
    id: "engineering-maturity",
    title: "Engineering maturity",
    levelStart: 80,
    levelEnd: 90,
    effortHours: { low: 90, high: 150 },
    prerequisites: ["production-systems"],
    passingScore: 80,
  },
  {
    id: "portfolio-job-readiness",
    title: "Portfolio and job readiness",
    levelStart: 90,
    levelEnd: 100,
    effortHours: { low: 100, high: 180 },
    prerequisites: ["engineering-maturity"],
    passingScore: 80,
  },
] as const;
