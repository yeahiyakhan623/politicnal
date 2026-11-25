import {
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Cpu,
  Factory,
  Landmark,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { InstitutePublicProfile } from "@/lib/public-profile/types";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function departmentIcon(name: string): LucideIcon {
  const value = name.toLowerCase();
  if (value.includes("computer")) return Cpu;
  if (value.includes("civil")) return Building2;
  if (value.includes("electrical")) return Zap;
  if (value.includes("automobile")) return Wrench;
  return BookOpen;
}

function serviceIcon(name: string): LucideIcon {
  const value = name.toLowerCase();
  if (value.includes("job") || value.includes("placement")) return BriefcaseBusiness;
  if (value.includes("industrial") || value.includes("attachment")) return Factory;
  if (value.includes("stipend")) return Wallet;
  return ShieldCheck;
}

export function AmrpiInstitutionSection({ profile }: { profile: InstitutePublicProfile }) {
  return (
    <section className="amrpi-institution" aria-labelledby="amrpi-institution-title">
      <div className="amrpi-institution-heading">
        <span className="public-section-number">05 / ABOUT AMRPI</span>
        <h2 id="amrpi-institution-title">A place to learn, build, and move forward.</h2>
        <p>
          Anjuman Moklesur Rahman Polytechnic Institute supports technical education through
          diploma technologies, student services, and practical career preparation.
        </p>
      </div>

      <article className="amrpi-overview amrpi-glass">
        <div className="amrpi-overview-icon"><Landmark size={22} /></div>
        <div>
          <span className="amrpi-card-kicker">INSTITUTE OVERVIEW</span>
          <h3>Technical education with a practical outlook</h3>
          <p>{profile.overview}</p>
        </div>
        <span className="amrpi-overview-watermark" aria-hidden="true"><Building2 size={100} /></span>
      </article>
      {profile.history && <article className="amrpi-history-card amrpi-glass">
        <span className="amrpi-card-kicker">OUR STORY</span>
        <p>{profile.history}</p>
      </article>}

      <div className="amrpi-subheading">
        <div><span className="amrpi-card-kicker">LEADERSHIP</span><h3>Institute leadership &amp; guidance</h3></div>
        <span className="amrpi-subheading-note">Serving the AMRPI community</span>
      </div>
      <div className="amrpi-leadership-grid">
        {profile.leadership.map((leader) => (
          <article className="amrpi-leader-card amrpi-glass" key={leader.name}>
            <div className="amrpi-leader-avatar mint" aria-hidden="true">
              {leader.imageUrl
                ? <span className="amrpi-leader-photo" style={{ backgroundImage: `url("${leader.imageUrl}")` }} />
                : <span>{initials(leader.name)}</span>}
              <i><Landmark size={14} /></i>
            </div>
            <span className="amrpi-leader-role">{leader.designation}</span>
            <h4>{leader.name}</h4>
            <p>{leader.bio}</p>
          </article>
        ))}
      </div>

      <div className="amrpi-subheading">
        <div><span className="amrpi-card-kicker">ACADEMIC AREAS</span><h3>Technologies &amp; departments</h3></div>
        <span className="amrpi-subheading-note">Explore technical learning pathways</span>
      </div>
      <div className="amrpi-technology-grid">
        {profile.departments.map((department, index) => {
          const Icon = departmentIcon(department.name);
          return <article className="amrpi-technology-card amrpi-glass" key={department.id}>
            <span className="amrpi-technology-tag">{String(index + 1).padStart(2, "0")}</span>
            <span className="amrpi-technology-icon"><Icon size={21} /></span>
            <h4>{department.name}</h4>
            {department.description && <p>{department.description}</p>}
            <span className="amrpi-technology-line" />
          </article>;
        })}
      </div>

      <div className="amrpi-subheading">
        <div><span className="amrpi-card-kicker">STUDENT SERVICES</span><h3>Support beyond the classroom</h3></div>
      </div>
      <div className="amrpi-services-grid">
        {profile.services.map((service) => {
          const Icon = serviceIcon(service.name);
          return <article className="amrpi-service-card amrpi-glass" key={service.id}>
            <span className="amrpi-service-icon"><Icon size={19} /></span>
            <span className="amrpi-service-label">STUDENT SERVICE</span>
            <h4>{service.name}</h4>
            <p>{service.description}</p>
            {service.url && <a className="amrpi-service-link" href={service.url} target="_blank" rel="noopener noreferrer">Open resource <ArrowUpRight size={13} /></a>}
          </article>;
        })}
      </div>

      <div className="amrpi-official-area">
        <div className="amrpi-official-copy">
          <span className="amrpi-card-kicker">OFFICIAL RESOURCES</span>
          <h3>Useful education links</h3>
          <p>Visit the relevant government and technical-education organizations.</p>
        </div>
        <div className="amrpi-official-links">
          {profile.links.map((link) => (
            <a href={link.url} key={link.id} target="_blank" rel="noopener noreferrer">
              <span><strong>{link.label}</strong><small>{link.description}</small></span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>

      <div className="amrpi-contact-card amrpi-glass">
        <div className="amrpi-contact-intro">
          <span className="amrpi-card-kicker">GET IN TOUCH</span>
          <h3>Connect with AMRPI</h3>
          <p>For admissions and institute information, contact the campus office.</p>
        </div>
        <div className="amrpi-contact-details">
          <a href={`https://maps.google.com/?q=${encodeURIComponent(profile.contact.address)}`} target="_blank" rel="noopener noreferrer">
            <span className="amrpi-contact-icon"><MapPin size={18} /></span>
            <span><small>CAMPUS ADDRESS</small><strong>{profile.contact.address}</strong></span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
          {profile.contact.phones.map((phone) => (
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} key={phone}>
              <span className="amrpi-contact-icon"><Phone size={18} /></span>
              <span><small>PHONE</small><strong>{phone}</strong></span>
            </a>
          ))}
          {profile.contact.email && <a href={`mailto:${profile.contact.email}`}>
            <span className="amrpi-contact-icon"><Mail size={18} /></span>
            <span><small>EMAIL</small><strong>{profile.contact.email}</strong></span>
          </a>}
        </div>
      </div>
    </section>
  );
}
