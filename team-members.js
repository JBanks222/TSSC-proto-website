(function () {
  'use strict';

  /**
   * Renders team cards from employees.json.
   * All text is inserted with textContent to avoid HTML injection.
   */
  async function loadTeamMembers () {
    const grid = document.getElementById('teamGrid');
    const status = document.getElementById('teamGridStatus');

    if (!grid || !status) return;

    status.textContent = 'Loading team directory...';

    try {
      const response = await fetch('employees.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load team data (' + response.status + ')');
      }

      const data = await response.json();
      const employees = Array.isArray(data.employees) ? data.employees : [];

      if (employees.length === 0) {
        status.textContent = 'No team members are listed yet.';
        return;
      }

      const fragment = document.createDocumentFragment();

      employees.forEach(function (employee) {
        const name = typeof employee.name === 'string' ? employee.name.trim() : '';
        const role = typeof employee.role === 'string' ? employee.role.trim() : '';
        const bio = typeof employee.bio === 'string' ? employee.bio.trim() : '';
        const headshot = typeof employee.headshot === 'string' ? employee.headshot.trim() : '';
        const email = typeof employee.email === 'string' ? employee.email.trim() : '';

        if (!name || !role || !bio || !headshot) {
          return;
        }

        const li = document.createElement('li');

        const article = document.createElement('article');
        article.className = 'team-card';
        article.tabIndex = 0;

        const photoWrap = document.createElement('div');
        photoWrap.className = 'team-card__photo-wrap';

        const img = document.createElement('img');
        img.className = 'team-card__photo';
        img.src = headshot;
        img.alt = 'Portrait of ' + name;
        img.width = 120;
        img.height = 120;
        img.loading = 'lazy';
        img.decoding = 'async';
        photoWrap.appendChild(img);

        const body = document.createElement('div');
        body.className = 'team-card__body';

        const nameEl = document.createElement('h3');
        nameEl.className = 'team-card__name mask-text';
        nameEl.textContent = name;

        const roleEl = document.createElement('p');
        roleEl.className = 'team-card__role';
        roleEl.textContent = role;

        const bioEl = document.createElement('p');
        bioEl.className = 'team-card__bio';
        bioEl.textContent = bio;

        body.appendChild(nameEl);
        body.appendChild(roleEl);
        body.appendChild(bioEl);

        if (email) {
          const emailEl = document.createElement('a');
          emailEl.className = 'team-card__email';
          emailEl.href = 'mailto:' + email;
          emailEl.setAttribute('aria-label', 'Email ' + name);
          emailEl.textContent = email;
          body.appendChild(emailEl);
        }

        article.appendChild(photoWrap);
        article.appendChild(body);
        li.appendChild(article);
        fragment.appendChild(li);
      });

      grid.innerHTML = '';
      grid.appendChild(fragment);

      const count = grid.children.length;
      status.textContent = count + ' team member' + (count === 1 ? '' : 's') + ' loaded.';
    } catch (error) {
      status.textContent = 'Unable to load team directory right now.';
      console.error(error);
    }
  }

  document.addEventListener('DOMContentLoaded', loadTeamMembers);
})();
