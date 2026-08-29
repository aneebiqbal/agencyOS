import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login"],
        disallow: [
          "/workspace",
          "/sales",
          "/projects",
          "/employees",
          "/time",
          "/expenses",
          "/invoicing",
          "/finance",
          "/payroll",
          "/performance",
          "/imports",
          "/profile",
          "/admin",
          "/api/",
        ],
      },
    ],
  };
}
