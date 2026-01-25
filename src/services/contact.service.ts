import { resend, emailConfig } from "../config/resend";
import { generateContactEmailTemplate } from "../templates/contactEmailTemplate";

interface ContactData {
  name: string;
  email: string;
  message: string;
}

interface ContactServiceResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class ContactService {
  async sendContactEmail(data: ContactData): Promise<ContactServiceResponse> {
    try {
      const { name, email, message } = data;

      // Generate email HTML
      const emailHtml = generateContactEmailTemplate({ name, email, message });

      // Send email using Resend
      const response = await resend.emails.send({
        from: emailConfig.from,
        to: emailConfig.to,
        subject: `New Contact Form Submission from ${name}`,
        html: emailHtml,
        replyTo: email,
      });

      return {
        success: true,
        messageId: response.data?.id ?? "",
      };
    } catch (error) {
      console.error("Error sending contact email:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  validateContactData(data: ContactData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      errors.push("Name is required");
    } else if (data.name.trim().length < 2) {
      errors.push("Name must be at least 2 characters long");
    } else if (data.name.trim().length > 100) {
      errors.push("Name must not exceed 100 characters");
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || data.email.trim().length === 0) {
      errors.push("Email is required");
    } else if (!emailRegex.test(data.email.trim())) {
      errors.push("Invalid email format");
    }

    // Validate message
    if (!data.message || data.message.trim().length === 0) {
      errors.push("Message is required");
    } else if (data.message.trim().length < 10) {
      errors.push("Message must be at least 10 characters long");
    } else if (data.message.trim().length > 5000) {
      errors.push("Message must not exceed 5000 characters");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
