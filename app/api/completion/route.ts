import { experimental_createMCPClient, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  compatibility: "strict",
});

export async function POST(req: Request) {
  const { prompt, type }: { prompt: string; type: "table" | "chart" } = await req.json();

  try {
    const sseClient = await experimental_createMCPClient({
      transport: {
        type: "sse",
        url: "https://db-query-mcp-server.akram-ansari-c95.workers.dev/sse",
      },
    });

    const tools = await sseClient.tools();

    const systemPrompt =
      type === "chart"
        ? `You are an SQL query assistant specialized in generating data for charts. Follow these steps exactly in order:

            1. FIRST call the getTablesInfoPostgres tool to retrieve all available tables and their schemas
            2. Analyze the table schemas to understand relationships and available columns
            3. Convert the user's request into proper SQL, focusing on getting data suitable for visualization
            4. Consider if JOINs are needed based on the relationships between tables
            5. Execute the SQL query using the queryDatabasePostgres tool
            6. If the query fails, fix any table or column name issues and retry once
            7. When the query succeeds, return a JSON object in this exact format:
                {
                  "success": true,
                  "type": "chart",
                  "data": [...rows from result...],
                  "columns": [...column names...],
                  "chartType": "bar" | "line" | "pie",
                  "xAxis": "column_name_for_x_axis",
                  "yAxis": "column_name_for_y_axis"
                }
            8. If all attempts fail, return: {"success":false,"error":"error message"}

            IMPORTANT: Output only the JSON object, no markdown or additional text.`
        : `You are an SQL query assistant. Follow these steps exactly in order:

            1. FIRST call the getTablesInfoPostgres tool to retrieve all available tables and their schemas
            2. Analyze the table schemas to understand relationships and available columns
            3. Convert the user's request into proper SQL, using the correct table and column names based on step 1
            4. Consider if JOINs are needed based on the relationships between tables
            5. Execute the SQL query using the queryDatabasePostgres tool
            6. If the query fails, fix any table or column name issues and retry once
            7. When the query succeeds, return a JSON object in this exact format:
              {
                "success": true,
                "type": "table",
                "data": [...rows from result...],
                "columns": [...column names...]
              }
            8. If all attempts fail, return: {"success":false,"error":"error message"}

            IMPORTANT: Output only the JSON object, no markdown or additional text.`;

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      tools,
      prompt,
      system: systemPrompt,
      maxSteps: 10,
    });

    // Close the client after use
    await sseClient.close();

    // Return the raw text directly as a JSON response
    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing query:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Something went wrong with your query. Please try again.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
