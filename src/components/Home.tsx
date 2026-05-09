import './Home.css'

export function Home() {
  return (
    <main className="home">
      <section className="home-intro">
        <p className="eyebrow">Your writing desk</p>
        <h1>Turn a manuscript into a finished book.</h1>
        <p>Create a project to begin writing and formatting.</p>
        <button type="button">Create a book</button>
      </section>
      <section className="project-list" aria-label="Recent projects">
        <h2>Recent projects</h2>
        <p>No projects yet.</p>
      </section>
    </main>
  )
}
