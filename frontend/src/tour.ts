import type { Outcome } from "./types";

export type QueueOrder = "heatroute" | "phone";

export interface TourStep {
  scenario: string;
  t: string;
  client: string | null;
  routes: boolean;
  order: QueueOrder;
  visit?: { client: string; outcome: Outcome };
  title: string;
  text: string;
}

// Each figure quoted here is checked against the model in backend/tests/test_tour.py.
export const TOUR: TourStep[] = [
  {
    scenario: "edmonton_2024", t: "2024-07-15T09:00", client: null, routes: false, order: "heatroute",
    title: "Edmonton, July 2024",
    text: "Real Environment Canada weather and 60 synthetic home care clients. Nobody's home is hot yet, so everyone is OK.",
  },
  {
    scenario: "edmonton_2024", t: "2024-07-16T12:00", client: "c01", routes: false, order: "heatroute",
    title: "Margaret, 84: OK now, urgent by evening",
    text: "Sixth floor, south-facing, no AC, lives alone. HeatRoute runs the same model six hours ahead, so a worker can go before her home turns dangerous.",
  },
  {
    scenario: "edmonton_2024", t: "2024-07-17T18:00", client: null, routes: false, order: "heatroute",
    title: "Margaret is #1, and here is why",
    text: "34.8°C indoors, 5 hours straight above 31°C. Gordon, 91, is older but has AC in a cool ground-floor unit, so he stays OK.",
  },
  {
    scenario: "edmonton_2024", t: "2024-07-17T18:00", client: null, routes: false, order: "phone",
    title: "The same hour, on today's oldest-first phone list",
    text: "8 clients are urgent. The first 8 calls reach only one of them, and Margaret is call #24.",
  },
  {
    scenario: "edmonton_2024", t: "2024-07-21T12:00", client: "c03", routes: false, order: "heatroute",
    title: "Wildfire smoke, the week the Jasper fire started",
    text: "Windows stay shut, so homes without AC can't cool at night. Walter, 77, has COPD: on watch now, forecast urgent by 18:00.",
  },
  {
    scenario: "edmonton_2024", t: "2024-07-21T12:00", client: null, routes: true, order: "heatroute",
    title: "Three workers, routes in one click",
    text: "Each worker starts with one of the three most urgent clients, then takes the nearest ones. ETAs included, and the sheet prints.",
  },
  {
    scenario: "edmonton_2024", t: "2024-07-21T12:00", client: null, routes: true, order: "heatroute",
    visit: { client: "c01", outcome: "moved_to_cooling" },
    title: "Margaret goes to a cooling centre",
    text: "The visit is logged: she moves to Handled, the queue re-ranks and the routes re-plan without her.",
  },
  {
    scenario: "vancouver_2021", t: "2021-06-28T18:00", client: null, routes: false, order: "heatroute",
    title: "Same people, same code, another city",
    text: "Metro Vancouver in the 2021 heat dome. Any city with Environment Canada data works the same way.",
  },
];
