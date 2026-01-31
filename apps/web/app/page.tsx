import styles from './page.module.css';

export default function Home() {
    return (
        <main className={styles.main}>
            <div className={styles.hero}>
                <div className={styles.badge}>⚡ Workflow Automation Platform</div>
                <h1 className={styles.title}>
                    Build. Execute. <span className={styles.gradient}>Automate.</span>
                </h1>
                <p className={styles.description}>
                    StateFlow is a production-grade workflow automation engine. Design complex workflows,
                    handle retries, manage state, and monitor executions in real-time.
                </p>
                <div className={styles.actions}>
                    <button className={styles.primaryBtn}>Get Started</button>
                    <button className={styles.secondaryBtn}>View Docs</button>
                </div>
            </div>

            <div className={styles.features}>
                <div className={styles.feature}>
                    <div className={styles.featureIcon}>🔄</div>
                    <h3>State Machine Engine</h3>
                    <p>Reliable execution with built-in state management and persistence</p>
                </div>
                <div className={styles.feature}>
                    <div className={styles.featureIcon}>🔁</div>
                    <h3>Smart Retries</h3>
                    <p>Configurable retry policies with exponential backoff</p>
                </div>
                <div className={styles.feature}>
                    <div className={styles.featureIcon}>📊</div>
                    <h3>Real-time Monitoring</h3>
                    <p>Track workflow executions with detailed logs and metrics</p>
                </div>
                <div className={styles.feature}>
                    <div className={styles.featureIcon}>🔌</div>
                    <h3>Extensible Steps</h3>
                    <p>Build custom step handlers for any integration</p>
                </div>
            </div>
        </main>
    );
}
