import { expect, test } from "bun:test";

import { compilePostmarkTemplate } from "./email-personalization";

// A Mustachio section ({{#first_name}}{{first_name}}{{/first_name}}) renders
// the name blank inside its own scope, so every bulk email greeted "Hi ,".
// Fields compile to flat keys whose value or fallback Growth resolves.
test("bulk templates carry each guest's field or its fallback", () => {
  const template = compilePostmarkTemplate({
    subject: "For {{first_name|you}}",
    html: "<p>Hi {{first_name|there}}, {{{ pm:unsubscribe }}}</p>",
    text: "Hi {{first_name|there}},",
  });
  expect(template.subject).toBe("For {{{f0}}}");
  expect(template.html).toBe("<p>Hi {{f1}}, {{{ pm:unsubscribe }}}</p>");
  expect(template.text).toBe("Hi {{{f2}}},");
  expect(template.modelFor({ email: "a@x.com", first_name: "Amy" })).toEqual({
    f0: "Amy",
    f1: "Amy",
    f2: "Amy",
  });
  expect(template.modelFor({ email: "b@x.com", first_name: " " })).toEqual({
    f0: "you",
    f1: "there",
    f2: "there",
  });
});
