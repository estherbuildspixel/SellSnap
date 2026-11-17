import React from 'react';
import Link from 'next/link';
import {
  MdBolt,
  MdArrowDownward,
  MdArrowForward,
  MdAutoAwesome,
  MdChatBubbleOutline,
  MdCheckCircle,
  MdCheckroom,
  MdContentCopy,
  MdLaptop,
  MdLink,
  MdLock,
  MdPayments,
  MdReceiptLong,
  MdRestaurant,
  MdSmartphone,
  MdStorefront,
  MdVerified,
  MdVerifiedUser,
  MdWork,
} from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PriceTag } from '@/components/product/PriceTag';
import { cn } from '@/lib/cn';
import { Reveal } from './_components/Reveal';
import { LottieScene } from './_components/LottieScene';
import styles from './page.module.css';

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.container}>
          <div className={styles.headerInner}>
            <Link href="/" className={styles.logo}>
              <span className={styles.logoText}>SellSnap</span>
            </Link>

            <nav className={styles.headerNav} aria-label="Primary">
              <a href="#how-it-works" className={styles.headerNavLink}>
                How it works
              </a>
              <a href="#features" className={styles.headerNavLink}>
                Features
              </a>
            </nav>

            <div className={styles.headerActions}>
              <Link href="/auth">
                <Button variant="ghost" size="sm">
                  Log in
                </Button>
              </Link>
              <Link href="/auth?mode=signup">
                <Button size="sm">Get started</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main id="main" className={styles.main}>
        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles.heroInner}>
              <div className={cn(styles.badge, styles.rise, styles.d1)}>
                <span className={styles.badgeDot} />
                <span>Commerce made effortless for Nigeria</span>
              </div>

              <h1 className={cn(styles.headline, styles.rise, styles.d2)}>
                Sell anything in seconds <br className={styles.break} />
                using <span className={styles.accent}>just a link.</span>
              </h1>

              <p className={cn(styles.subtitle, styles.rise, styles.d3)}>
                No storefront or setup. Share a link,{' '}
                <span className={styles.nowrap}>get paid in Naira.</span>
              </p>

              <div className={cn(styles.ctaGroup, styles.rise, styles.d4)}>
                <Link href="/auth?mode=signup" className={styles.ctaLink}>
                  <Button variant="primary" size="lg" className={styles.ctaButton}>
                    Get Started <MdArrowForward size={18} aria-hidden="true" />
                  </Button>
                </Link>
                <a href="#how-it-works" className={styles.ctaLink}>
                  <Button variant="secondary" size="lg">
                    See how it works{' '}
                    <MdArrowDownward size={16} aria-hidden="true" className={styles.arrowDown} />
                  </Button>
                </a>
              </div>

              {/* The product itself: a shared SellSnap payment link */}
              <div className={cn(styles.mockStage, styles.rise, styles.d5)} aria-hidden="true">
                <div className={styles.mockAura} />
                <div className={styles.mockCard}>
                  <div className={styles.mockUrlBar}>
                    <MdLock size={12} className={styles.mockLock} />
                    <span className={styles.mockUrl}>sellsnap.ng/p/ankara-gown</span>
                    <MdContentCopy size={14} />
                  </div>

                  <div className={styles.mockMedia}>
                    <span className={styles.mockMediaEmoji}>
                      <MdCheckroom size={64} aria-hidden="true" />
                    </span>
                    <span className={styles.mockMediaTag}>In stock</span>
                  </div>

                  <div className={styles.mockSeller}>
                    <span className={styles.mockAvatar}>A</span>
                    <span className={styles.mockSellerName}>Adaeze&apos;s Closet</span>
                    <MdVerified size={14} className={styles.mockVerified} />
                  </div>

                  <div className={styles.mockMeta}>
                    <span className={styles.mockName}>Ankara Flare Gown</span>
                    <PriceTag priceInKobo={1250000} size="sm" />
                  </div>

                  <span className={styles.mockButton}>
                    Pay <span className={styles.mockButtonAmount}>₦12,500</span> securely
                  </span>
                  <p className={styles.mockTrust}>
                    <MdVerifiedUser size={14} />
                    <span>Secured by Flutterwave</span>
                  </p>
                </div>

                <div className={styles.mockChip} data-position="top">
                  <MdContentCopy size={14} />
                  <span>Link copied</span>
                </div>
                <div className={styles.mockChip} data-position="bottom">
                  <LottieScene
                    src="/lottie/success-check.json"
                    className={styles.chipAnimation}
                    loop={false}
                  />
                  <span>Payment received · ₦12,500</span>
                </div>
              </div>

              {/* Value highlights */}
              <ul className={cn(styles.highlights, styles.rise, styles.d6)}>
                <li className={styles.highlightItem}>
                  <MdBolt size={14} aria-hidden="true" />
                  <span>Zero website setup</span>
                </li>
                <li className={styles.highlightDivider} aria-hidden="true" />
                <li className={styles.highlightItem}>
                  <MdChatBubbleOutline size={14} aria-hidden="true" />
                  <span>Made for WhatsApp &amp; IG</span>
                </li>
                <li className={styles.highlightDivider} aria-hidden="true" />
                <li className={styles.highlightItem}>
                  <MdVerifiedUser size={14} aria-hidden="true" />
                  <span>Powered by Flutterwave</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Who it's for */}
        <section className={styles.categories} aria-label="Who SellSnap is for">
          <div className={styles.container}>
            <div className={styles.categoriesInner}>
              <p className={styles.categoriesLabel}>Built for how you already sell</p>
              <ul className={styles.categoryList}>
                <li className={styles.categoryItem}>
                  <MdCheckroom size={16} aria-hidden="true" />
                  <span>Fashion &amp; thrift</span>
                </li>
                <li className={styles.categoryItem}>
                  <MdRestaurant size={16} aria-hidden="true" />
                  <span>Food &amp; groceries</span>
                </li>
                <li className={styles.categoryItem}>
                  <MdAutoAwesome size={16} aria-hidden="true" />
                  <span>Beauty &amp; hair</span>
                </li>
                <li className={styles.categoryItem}>
                  <MdLaptop size={16} aria-hidden="true" />
                  <span>Digital products</span>
                </li>
                <li className={styles.categoryItem}>
                  <MdSmartphone size={16} aria-hidden="true" />
                  <span>Gadgets</span>
                </li>
                <li className={styles.categoryItem}>
                  <MdWork size={16} aria-hidden="true" />
                  <span>Services</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className={styles.steps}>
          <div className={styles.container}>
            <Reveal>
              <div className={styles.sectionHead}>
                <LottieScene
                  src="/lottie/shopping-bag.json"
                  className={styles.stepsAnimation}
                />
                <span className={styles.eyebrow}>How it works</span>
                <h2 className={styles.sectionTitle}>Three steps to your first sale</h2>
                <p className={styles.sectionLead}>
                  From product photo to paid order in minutes — no developer, no
                  storefront, no waiting.
                </p>
              </div>
            </Reveal>

            <div className={styles.stepsGrid}>
              <Reveal className={styles.revealCell} delay={100}>
                <div className={styles.step}>
                  <span className={styles.stepNumber} aria-hidden="true">
                    01
                  </span>
                  <span className={styles.stepIcon}>
                    <MdStorefront size={20} aria-hidden="true" />
                  </span>
                  <h3 className={styles.stepTitle}>Create your product</h3>
                  <p className={styles.stepDescription}>
                    Add a photo and a price. Your payment link is live instantly.
                  </p>
                </div>
              </Reveal>

              <Reveal className={styles.revealCell} delay={220}>
                <div className={styles.step}>
                  <span className={styles.stepNumber} aria-hidden="true">
                    02
                  </span>
                  <span className={styles.stepIcon}>
                    <MdChatBubbleOutline size={20} aria-hidden="true" />
                  </span>
                  <h3 className={styles.stepTitle}>Share the link</h3>
                  <p className={styles.stepDescription}>
                    Paste it into WhatsApp, Instagram, or anywhere your buyers
                    already are.
                  </p>
                </div>
              </Reveal>

              <Reveal className={styles.revealCell} delay={340}>
                <div className={styles.step}>
                  <span className={styles.stepNumber} aria-hidden="true">
                    03
                  </span>
                  <span className={styles.stepIcon}>
                    <MdCheckCircle size={20} aria-hidden="true" />
                  </span>
                  <h3 className={styles.stepTitle}>Get paid in Naira</h3>
                  <p className={styles.stepDescription}>
                    Flutterwave settles the payment and it shows up in your
                    dashboard.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className={styles.features}>
          <div className={styles.container}>
            <Reveal>
              <div className={styles.sectionHead}>
                <span className={styles.eyebrow}>Why SellSnap</span>
                <h2 className={styles.sectionTitle}>Everything you need to get paid</h2>
                <p className={styles.sectionLead}>
                  A complete checkout in one link, so you can focus on selling
                  instead of chasing transfers.
                </p>
              </div>
            </Reveal>

            <div className={styles.featuresGrid}>
              <Reveal className={styles.revealCell} delay={80}>
                <Card className={styles.featureCard}>
                  <span className={styles.featureIcon}>
                    <MdLink size={20} aria-hidden="true" />
                  </span>
                  <h3 className={styles.featureTitle}>Instant payment links</h3>
                  <p className={styles.featureDescription}>
                    Every product gets its own shareable link the moment you add
                    it.
                  </p>
                </Card>
              </Reveal>

              <Reveal className={styles.revealCell} delay={180}>
                <Card className={styles.featureCard}>
                  <span className={styles.featureIcon}>
                    <MdPayments size={20} aria-hidden="true" />
                  </span>
                  <h3 className={styles.featureTitle}>Paid in Naira</h3>
                  <p className={styles.featureDescription}>
                    Card, transfer and Naira payments settle straight to your
                    account.
                  </p>
                </Card>
              </Reveal>

              <Reveal className={styles.revealCell} delay={280}>
                <Card className={styles.featureCard}>
                  <span className={styles.featureIcon}>
                    <MdReceiptLong size={20} aria-hidden="true" />
                  </span>
                  <h3 className={styles.featureTitle}>Track every order</h3>
                  <p className={styles.featureDescription}>
                    See who paid, what they bought and when — all in your
                    dashboard.
                  </p>
                </Card>
              </Reveal>

              <Reveal className={styles.revealCell} delay={380}>
                <Card className={styles.featureCard}>
                  <span className={styles.featureIcon}>
                    <MdBolt size={20} aria-hidden="true" />
                  </span>
                  <h3 className={styles.featureTitle}>Zero setup</h3>
                  <p className={styles.featureDescription}>
                    No code, no domain, no store design. Just sign up and sell.
                  </p>
                </Card>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className={styles.cta}>
          <div className={styles.container}>
            <Reveal>
              <div className={styles.ctaPanel}>
                <div className={styles.ctaContent}>
                  <LottieScene
                    src="/lottie/share-network.json"
                    className={styles.ctaAnimation}
                  />
                  <h2 className={styles.ctaTitle}>Ready to sell with a link?</h2>
                  <p className={styles.ctaText}>
                    Join Nigerian sellers turning chats into paid orders. Create
                    your first link in under a minute.
                  </p>
                  <div className={styles.ctaActions}>
                    <Link href="/auth?mode=signup" className={styles.ctaLink}>
                      <Button variant="primary" size="lg" className={styles.ctaButton}>
                        Get Started <MdArrowForward size={18} aria-hidden="true" />
                      </Button>
                    </Link>
                    <Link href="/auth" className={styles.ctaLogin}>
                      Log in
                    </Link>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerInner}>
            <div className={styles.footerBrand}>
              <span className={styles.footerLogo}>SellSnap</span>
            </div>

            <nav className={styles.footerNav} aria-label="Footer">
              <a href="#how-it-works" className={styles.footerLink}>
                How it works
              </a>
              <a href="#features" className={styles.footerLink}>
                Features
              </a>
              <Link href="/auth" className={styles.footerLink}>
                Log in
              </Link>
              <Link href="/auth?mode=signup" className={styles.footerLink}>
                Get started
              </Link>
            </nav>

            <p className={styles.footerText}>
              © {new Date().getFullYear()} — Simple, instant link commerce for
              Nigerian businesses.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
