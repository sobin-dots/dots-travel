/** Deterministic test input only; never imported by application code. */
export function itineraryFixture(days: number, destination: string): string {
  return `# ${days}-Day ${destination} Journey\n` + Array.from({ length: days }, (_, i) =>
    `### Day ${i + 1}: Proposed ${destination} programme\nMorning: Explore the proposed heritage route at a relaxed pace, with time to visit the museum and stop for lunch independently. Afternoon: Continue through the local district and waterfront before returning to the accommodation. Evening: Free time for independent dining. All proposed services remain subject to confirmation.`
  ).join('\n\n');
}
