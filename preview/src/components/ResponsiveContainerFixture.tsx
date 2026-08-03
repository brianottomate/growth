import { Button } from "@wandercom/design-system-web/ui/button";
import { BookDirect } from "@wandercom/website-registry/components/BookDirect/BookDirect";
import { Categories } from "@wandercom/website-registry/components/Categories/Categories";
import { Footer } from "@wandercom/website-registry/components/Footer";
import { NavBar } from "@wandercom/website-registry/components/Navbar";
import { SectionHeading } from "@wandercom/website-registry/shared/components/SectionHeading";

const categoryImage =
  "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80";

export const ResponsiveContainerFixture = () => {
  return (
    <div className="bg-surface-secondary min-h-screen overflow-x-auto p-8">
      <div className="mx-auto w-fit">
        <p className="text-secondary mb-3 text-sm">
          Desktop viewport with a 390px rendered website container
        </p>
        <div className="w-[390px] overflow-hidden border" data-responsive-fixture>
          <div className="wander-website-root @container w-full">
            <div className="container mx-auto">
              <NavBar
                website={{ title: "Wander Preview" }}
                menuItems={[
                  { type: "link", label: "Homes", href: "#homes" },
                  { type: "link", label: "About", href: "#about" },
                ]}
                actionButton={
                  <Button size="md" variant="primary">
                    Book now
                  </Button>
                }
              />

              <div className="px-6 py-(--spacing-layout-md)" data-fixture-typography>
                <SectionHeading
                  eyebrow="Container typography"
                  title="Mobile scale at 390px"
                  description="This heading remains on the mobile type ramp in a desktop browser."
                  size="lg"
                />
              </div>

              <div data-fixture-columns>
                <BookDirect
                  eyebrow="Mobile columns"
                  title="One column inside the embedded website"
                />
              </div>

              <div data-fixture-carousel>
                <Categories
                  title="Mobile carousel"
                  subtitle="Horizontal cards remain swipeable"
                  items={[
                    { title: "Coastal", imageUrl: categoryImage },
                    { title: "Desert", imageUrl: categoryImage },
                    { title: "Mountain", imageUrl: categoryImage },
                  ]}
                />
              </div>

              <div data-fixture-footer>
                <Footer
                  hasRentalAgreement={false}
                  pagesLinks={[
                    { title: "Homes", path: "/homes" },
                    { title: "About", path: "/about" },
                  ]}
                  website={{
                    title: "Wander Preview",
                    supportEmail: "hello@example.com",
                    instagramLink: "https://instagram.com/wander",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
