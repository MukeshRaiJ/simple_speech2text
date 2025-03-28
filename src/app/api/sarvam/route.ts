// File: app/api/sarvam/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Get the API key from environment variables
    const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
    
    if (!SARVAM_API_KEY) {
      return NextResponse.json(
        { error: "SARVAM_API_KEY is not configured on the server" },
        { status: 500 }
      );
    }

    // Get the form data from the request
    const formData = await request.formData();
    
    // Forward the request to Sarvam API
    const response = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: {
        "api-subscription-key": SARVAM_API_KEY,
      },
      body: formData,
    });

    // If the response is not ok, throw an error
    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Sarvam API Error (${response.status}): ${errorText}` },
        { status: response.status }
      );
    }

    // Parse the response as JSON
    const data = await response.json();
    
    // Return the response
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      { error: "Internal server error: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}